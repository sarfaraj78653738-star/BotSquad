import { fetchPublicPageText } from './providers';
import { listWorkspaceFiles, readWorkspaceFile, safeWorkspacePath, writeWorkspaceFile } from './workspace';

// Plugin runner (user order 2026-10-31): run a plugin's JavaScript
// ON THE PHONE, with no host and no server. Why a WebView: the app's
// own engine (Hermes) has no eval, so downloaded JS cannot run in
// the app runtime itself. A hidden WebView carries a full browser
// engine (V8 on Android, JavaScriptCore on iOS) that does run it.
// Sandbox shape, stated plainly: plugin code runs in a blank page
// that holds no app data. It reaches the app ONLY through the small
// bridge below (workspace files, public-page reads, logging). It
// never sees keys, tokens, the database, or native APIs, and file
// writes pause for the user's approval exactly like agent writes.
// What it cannot do even here: Node APIs (fs, child_process),
// native modules, or npm packages that need Node built-ins. A plugin
// finishes by calling pluginDone(result); a run that never does is
// cut off by the timeout.

export type PluginApprove = (summary: string, preview: string) => Promise<boolean>;

export type RunPluginOpts = {
  code: string;
  input?: string;
  section?: string; // '' = Main Chat, else 'bots/<id>' or 'groups/<threadId>'
  approve: PluginApprove;
  timeoutMs?: number;
};

export type RunPluginResult = { ok: boolean; result?: string; logs: string[]; error?: string };

// The page the sandbox runs. Plugin code arrives later, over the
// message channel — never baked into this HTML — so no escaping
// problems with the plugin's own text. Listens on both window and
// document for the host's messages; duplicate deliveries are
// harmless (a repeated 'run' id is ignored, a spent call id is gone).
export const PLUGIN_RUNNER_HTML = `<!DOCTYPE html><html><body><script>(function(){
var runId = null, calls = {}, callSeq = 0, finished = false;
function send(o){ window.ReactNativeWebView.postMessage(JSON.stringify(o)); }
function hostCall(name, args){
  return new Promise(function(resolve, reject){
    var id = 'c' + (++callSeq);
    calls[id] = { resolve: resolve, reject: reject };
    send({ type: 'call', runId: runId, id: id, name: name, args: args });
  });
}
var host = {
  log: function(t){ send({ type: 'log', runId: runId, text: String(t) }); },
  listFiles: function(p){ return hostCall('listFiles', [p || '']); },
  readFile: function(p){ return hostCall('readFile', [p]); },
  writeFile: function(p, c){ return hostCall('writeFile', [p, c]); },
  fetchText: function(u){ return hostCall('fetchText', [u]); }
};
function done(result){
  if (finished) return; finished = true;
  var text = (typeof result === 'string') ? result : JSON.stringify(result === undefined ? null : result);
  send({ type: 'done', runId: runId, result: text });
}
function fail(err){
  if (finished) return; finished = true;
  send({ type: 'error', runId: runId, error: err && err.message ? err.message : String(err) });
}
window.onerror = function(msg){ fail(msg); };
window.addEventListener('unhandledrejection', function(e){ fail(e.reason); });
function onMsg(e){
  var msg; try { msg = JSON.parse(e.data); } catch (err) { return; }
  if (msg.type === 'result' && calls[msg.id]) {
    var c = calls[msg.id]; delete calls[msg.id]; c.resolve(msg.value);
  } else if (msg.type === 'error' && calls[msg.id]) {
    var c2 = calls[msg.id]; delete calls[msg.id]; c2.reject(new Error(msg.error || 'host error'));
  } else if (msg.type === 'run') {
    if (msg.id === runId) return;
    runId = msg.id; finished = false;
    try {
      var fn = new Function('host', 'pluginDone', 'input', msg.code);
      var ret = fn(host, done, msg.input || '');
      if (ret && typeof ret.then === 'function') ret.then(function(v){ done(v); }, fail);
    } catch (err) { fail(err); }
  }
}
window.addEventListener('message', onMsg);
document.addEventListener('message', onMsg);
})();</script></body></html>`;

type Transport = { post: (msg: string) => void };

let transport: Transport | null = null;
let hostReady = false;
const readyWaiters: Array<() => void> = [];

export function setPluginTransport(t: Transport | null): void {
  transport = t;
  flushReadyWaiters();
}

export function setPluginReady(): void {
  hostReady = true;
  flushReadyWaiters();
}

function flushReadyWaiters(): void {
  if (transport && hostReady) {
    const w = readyWaiters.splice(0);
    w.forEach((f) => f());
  }
}

function waitForHost(timeoutMs: number): Promise<boolean> {
  if (transport && hostReady) return Promise.resolve(true);
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    readyWaiters.push(() => { clearTimeout(timer); resolve(true); });
  });
}

function scopedPath(section: string, raw: string): string | null {
  const cleaned = safeWorkspacePath(raw);
  if (!cleaned) return null;
  if (!section) return cleaned;
  if (cleaned === section || cleaned.startsWith(`${section}/`)) return cleaned;
  return `${section}/${cleaned}`;
}

type ActiveRun = {
  id: string;
  section: string;
  approve: PluginApprove;
  logs: string[];
  finish: (r: RunPluginResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

let active: ActiveRun | null = null;
const queue: Array<{ opts: RunPluginOpts; resolve: (r: RunPluginResult) => void }> = [];
let runSeq = 0;

export function runPluginCode(opts: RunPluginOpts): Promise<RunPluginResult> {
  return new Promise((resolve) => {
    queue.push({ opts, resolve });
    void pump();
  });
}

async function pump(): Promise<void> {
  if (active || queue.length === 0) return;
  const job = queue.shift()!;
  const id = `run-${Date.now()}-${++runSeq}`;
  const logs: string[] = [];
  let settled = false;
  const finish = (r: RunPluginResult): void => {
    if (settled) return;
    settled = true;
    clearTimeout(active?.timer);
    if (active?.id === id) active = null;
    job.resolve({ ...r, logs });
    void pump();
  };
  const timer = setTimeout(() => {
    finish({ ok: false, logs, error: 'Timed out after 30s (the plugin never called pluginDone — it must call pluginDone(result) when finished).' });
  }, job.opts.timeoutMs ?? 30000);
  active = { id, section: job.opts.section ?? '', approve: job.opts.approve, logs, finish, timer };
  const hostOk = await waitForHost(10000);
  if (!hostOk || !transport) {
    finish({ ok: false, logs, error: 'Plugin runner is not ready (the app needs the new version with the sandbox host).' });
    return;
  }
  transport.post(JSON.stringify({ type: 'run', id, code: job.opts.code, input: job.opts.input ?? '' }));
}

// Called by the host component for every message arriving from the
// sandbox page. Messages for a finished or unknown run are ignored.
export async function handlePageMessage(raw: string): Promise<void> {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { return; }
  const run = active;
  if (!run || msg.runId !== run.id) return;
  const reply = (payload: unknown): void => {
    transport?.post(JSON.stringify(payload));
  };
  if (msg.type === 'log') {
    if (run.logs.length < 50) run.logs.push(String(msg.text ?? '').slice(0, 500));
    return;
  }
  if (msg.type === 'done') {
    run.finish({ ok: true, result: typeof msg.result === 'string' ? msg.result : '', logs: run.logs });
    return;
  }
  if (msg.type === 'error') {
    run.finish({ ok: false, error: String(msg.error ?? 'plugin error'), logs: run.logs });
    return;
  }
  if (msg.type !== 'call') return;
  const callId = msg.id as string;
  const args: unknown[] = Array.isArray(msg.args) ? msg.args : [];
  const argStr = (i: number): string => (typeof args[i] === 'string' ? (args[i] as string) : '');
  try {
    if (msg.name === 'listFiles') {
      const prefix = argStr(0);
      const files = await listWorkspaceFiles();
      const scoped = run.section ? files.filter((f) => f.path.startsWith(`${run.section}/`)) : files;
      const filtered = prefix
        ? scoped.filter((f) => f.path.startsWith(run.section ? `${run.section}/${prefix}` : prefix))
        : scoped;
      reply({ type: 'result', id: callId, value: filtered.map((f) => `${f.path} (${f.size} bytes)`).join('\n') || '(empty)' });
    } else if (msg.name === 'readFile') {
      const p = scopedPath(run.section, argStr(0));
      if (!p) throw new Error('invalid path (paths stay inside the workspace, no "..").');
      reply({ type: 'result', id: callId, value: await readWorkspaceFile(p) });
    } else if (msg.name === 'writeFile') {
      const p = scopedPath(run.section, argStr(0));
      const content = argStr(1);
      if (!p) throw new Error('invalid path (paths stay inside the workspace, no "..").');
      const ok = await run.approve(`Write ${p} (plugin)`, content.slice(0, 800));
      if (!ok) throw new Error('rejected by user.');
      await writeWorkspaceFile(p, content);
      reply({ type: 'result', id: callId, value: 'ok' });
    } else if (msg.name === 'fetchText') {
      const url = argStr(0);
      if (!/^https:\/\/[^/\s]+/.test(url)) throw new Error('fetchText needs a full https:// URL.');
      const page = await fetchPublicPageText(url);
      reply({ type: 'result', id: callId, value: `Title: ${page.title}\n${page.text.slice(0, 8000)}` });
    } else {
      throw new Error(`unknown host action "${String(msg.name)}".`);
    }
  } catch (e) {
    reply({ type: 'error', id: callId, error: e instanceof Error ? e.message : 'host error' });
  }
}
