import { fetchPublicPageText } from './providers';
import { deleteWorkspaceFile, listWorkspaceFiles, readWorkspaceFile, safeWorkspacePath, workspaceDir, writeWorkspaceFile } from './workspace';
import { runPluginCode } from './pluginRunner';
import { listPlugins, listSkills, savePlugin, saveSkill } from './db';
import { newId, nowIso } from './types';
import { serviceRequest, vercelDeploy } from './serviceTools';
import { listMcpServers } from './db';
import { getMcpToken } from './connections';
import { requireHttpsUrl } from './mcp';

// Agent tools for Main Chat (user order 2026-10-29): the app is not
// just a chatbot anymore — Main Chat can work with files, search its
// workspace, read public web pages, drive the in-chat browser panel
// (via the existing [BROWSER] commands in its replies), and now work
// on CONNECTED services: service_request calls any endpoint of any
// verified connection, and vercel_deploy publishes workspace files
// live. It stays a chatbot too: tools run only when the model emits a
// tool block for a real task; a plain question still gets a plain
// reply, with no tool use at all.
// Hard limits, stated plainly: the phone cannot run terminal commands,
// servers, or tests, so there is no "run" tool — the agent writes
// code, the user previews pages on the phone and exports the rest.
// One exception (user order 2026-10-31): the agent CAN download a
// public GitHub repo into the workspace with download_repo, via
// isomorphic-git (pure JavaScript git — no terminal, no server).
// Second exception (same order): the agent CAN run a plugin's
// JavaScript on the phone with run_plugin, inside the hidden WebView
// sandbox (src/lib/pluginRunner.ts) — no host, no server. Plugin
// code never runs in the app's own runtime.
// File writes, edits, and deletes NEVER run without the user's
// approval on that exact change (the approval card in chat).
export type AgentToolCall = { name: string; args: Record<string, unknown> };

export const AGENT_TOOLS_PROMPT = `
You are also an agent with tools, not only a chatbot. For ordinary questions, just answer normally with no tool use. When the user asks you to build, change, find, or check something in files or on the web, use tools. Emit each tool call as its own fenced block, and nothing else in that message except at most one short line before the block. Never emit <dots_function_call> or any other tool syntax — only the fenced blocks above:
\`\`\`tool
{"name": "list_files", "args": {}}
\`\`\`
Available tools:
- list_files {path?}: list workspace files (path is a folder prefix, blank for all).
- read_file {path}: read one workspace file (text only).
- search_files {query}: search all workspace files for text, returns matching file paths with line numbers.
- write_file {path, content}: create or overwrite a workspace file. Runs ONLY after the user approves that exact change in chat.
- edit_file {path, old_text, new_text}: replace the first occurrence of old_text in a workspace file. Runs ONLY after the user approves that exact change.
- delete_file {path}: delete a workspace file. Runs ONLY after the user approves it.
- browser_read {url}: read a PUBLIC web page as text. Never for logins, paywalls, or CAPTCHAs — those always go to the user.
- service_request {service, method, path, body?}: call a CONNECTED service's own API. service is the service name from [CONNECTED SERVICES] (the prompt lists what is actually connected — never call a service that is not listed). method is GET, POST, PUT, PATCH, or DELETE. path is a relative API path only, like "/user/repos" — never a full URL. body is a JSON string for non-GET calls. GET calls run straight away; any other method runs ONLY after the user approves that exact call in chat. Examples: GitHub list repos GET "/user/repos"; Slack send POST "/chat.postMessage" {"channel":"#general","text":"hi"}; Telegram send POST "/sendMessage" {"chat_id":"123","text":"hi"}; Trello create card POST "/cards" {"name":"Buy milk","idList":"abc"}; Todoist create task POST "/tasks" {"content":"Buy milk"}; WhatsApp send POST "/{phoneId}/messages" {"messaging_product":"whatsapp","to":"919999999999","type":"text","text":{"body":"hi"}} — {phoneId} is filled from the connection, never invent it. You never see any key or token: never ask for one, never print one, never put one in a path or body.
- vercel_deploy {files, project?}: publish workspace files as a live production site on Vercel (the "make my website live" tool). files is a list of workspace paths, like ["index.html", "style.css"]. Runs ONLY after the user approves the deploy, and only when Vercel is connected. Returns the live URL.
- mcp_call {server, tool, args}: run one tool of the MCP server called out this turn (see the [MCP SERVER] block in your prompt — never call a server that is not called out). args is a JSON object. Runs ONLY after the user approves that exact call in chat.
- download_repo {repo}: download a PUBLIC GitHub repo into workspace/repos/<owner>-<repo>/ ("owner/name" or a github.com URL; latest files only, single branch). Runs ONLY after the user approves that exact download in chat. Use it when the user asks to download or fetch a GitHub repo.
- run_plugin {plugin}: run a plugin's JavaScript on this phone in the WebView sandbox — no host, no server. Give a plugin name, a github.com repo ("owner/name" or URL), or a workspace .js file. A repo is downloaded first if needed, then its entry file is found automatically (package.json main, index.js, main.js, plugin.js); a repo with only SKILL.md is installed as a skill instead of running. Runs ONLY after the user approves that exact run in chat. The plugin can read workspace files, write them (each write needs approval), and read public pages, and must call pluginDone(result) when finished.
Rules: never invent file contents you have not read; paths stay inside the workspace (no absolute paths, no ".."); one tool call per block; after each tool result, either emit the next tool block or give your final reply with no tool block. In your final reply, briefly list what you did (files created/changed, what to preview or export, any live URL). You cannot run commands, servers, or tests on this phone — say so plainly if asked. But you CAN download a public GitHub repo with download_repo and run a plugin's JavaScript with run_plugin; offer those when asked to fetch or run a repo. For a connected service you do not know the API for, try its standard REST path; if the service returns an error, report it plainly instead of guessing another call.
`;

// Workspace file tools for bot and group chats (user order 2026-10-30):
// the same file tools Main Chat has, including deploy (vercel_deploy
// enabled for bot/group chats on the user's explicit 2026-10-30 order:
// "whatever Main Chat can do, bot and group can do"). Writes/edits/
// deletes/deploys still pause at the chat's approval card, and the loop
// filter is what keeps any other tool out of these chats.
export const FILE_TOOL_NAMES = ['list_files', 'read_file', 'search_files', 'write_file', 'edit_file', 'delete_file', 'browser_read', 'download_repo', 'run_plugin'];

export const BOT_FILE_TOOLS_PROMPT = `
[WORKSPACE FILE TOOLS — you can also work with files in the phone's workspace, exactly like Main Chat, with the same approval rule. Emit each tool call as its own fenced block. Never emit <dots_function_call> or any other tool syntax — only the fenced blocks:
\`\`\`tool
{"name": "write_file", "args": {"path": "index.html", "content": "..."}}
\`\`\`
- list_files {path?}: list workspace files (blank for all).
- read_file {path}: read one workspace file (text only).
- search_files {query}: search workspace files for text.
- write_file {path, content}: create or overwrite a workspace file. Runs ONLY after the user approves that exact change.
- edit_file {path, old_text, new_text}: replace text in a workspace file. Runs ONLY after the user approves that exact change.
- delete_file {path}: delete a workspace file. Runs ONLY after the user approves it.
- browser_read {url}: read a PUBLIC web page as text (no logins, paywalls, or CAPTCHAs).
- vercel_deploy {files, project?}: publish workspace files as a live production site on Vercel. Runs ONLY after the user approves the deploy, and only when Vercel is connected. Returns the live URL.
- download_repo {repo}: download a PUBLIC GitHub repo into workspace/repos/<owner>-<repo>/ ("owner/name" or a github.com URL; latest files only, single branch). Runs ONLY after the user approves that exact download in chat.
- run_plugin {plugin}: run a plugin's JavaScript on this phone in the WebView sandbox — no host, no server. Give a plugin name, a github.com repo ("owner/name" or URL), or a workspace .js file. A repo is downloaded first if needed, then its entry file is found automatically (package.json main, index.js, main.js, plugin.js); a repo with only SKILL.md is installed as a skill instead of running. Runs ONLY after the user approves that exact run in chat.
Rules: paths stay inside the workspace (no absolute paths, no ".."); one tool call per block; after each tool result, either emit the next tool block or give your final reply with no tool block. In your final reply, briefly list what you did (files created/changed, what to preview or export). You cannot run commands, servers, or tests on this phone, but you CAN download a public GitHub repo with download_repo and run a plugin's JavaScript with run_plugin; say so plainly if asked.]`;

// Extract a balanced {...} JSON object starting at or after `start`
// (brace-counting, string/escape aware, so nested objects and
// multi-line JSON survive). Returns null when unbalanced.
function extractBalancedJson(text: string, start: number): { json: string; end: number } | null {
  const open = text.indexOf('{', start);
  if (open === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else {
      if (ch === '"') inStr = true;
      else if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) return { json: text.slice(open, i + 1), end: i + 1 };
      }
    }
  }
  return null;
}

// The dots model family (dots-studio) emits its native tool format
// instead of the prompted ```tool fenced blocks (user report
// 2026-11-01: raw <dots_function_call> text shown as the reply and
// nothing executed — the parser found no fenced blocks, so the loop
// broke immediately and the stripper removed nothing). Normalize
// that format into fenced blocks so the existing parser + stripper
// handle it: a dots block becomes exactly what the model was asked
// to emit. In dots form the JSON after '<' IS the args object, so it
// is wrapped as {name, args}. A malformed dots block still converts
// (parse ignores it, strip removes it), exactly like a malformed
// fenced block — raw syntax is never shown.
export function normalizeDotsCalls(reply: string): string {
  let out = '';
  let rest = reply;
  for (;;) {
    const start = rest.indexOf('<dots_function_call>');
    if (start === -1) { out += rest; break; }
    out += rest.slice(0, start);
    const afterTag = rest.slice(start + '<dots_function_call>'.length);
    const inv = afterTag.match(/<invoke\s+name="([^"]+)">/);
    if (!inv || inv.index === undefined) {
      // Unrecognizable dots tag — drop it and continue, never show it.
      rest = afterTag;
      continue;
    }
    const argsStart = inv.index + inv[0].length;
    const afterInvoke = afterTag.slice(argsStart);
    const lt = afterInvoke.indexOf('<');
    let jsonText = '';
    let end = argsStart;
    if (lt !== -1) {
      const ext = extractBalancedJson(afterInvoke, lt);
      if (ext) {
        jsonText = ext.json;
        end = argsStart + ext.end;
      } else {
        jsonText = afterInvoke.slice(lt + 1).trim();
        end = afterTag.length;
      }
    }
    // Skip trailing closers: '>', '</invoke>', '</dots_function_call>'.
    const tail = afterTag.slice(end).replace(/^\s*(?:>\s*)?(?:<\/invoke>\s*)?(?:<\/dots_function_call>\s*)?/, '');
    let args: unknown = {};
    try { args = JSON.parse(jsonText) as unknown; } catch { args = {}; }
    out += '```tool\n' + JSON.stringify({ name: inv[1], args: (args && typeof args === 'object' ? args : {}) }) + '\n```';
    rest = tail;
  }
  return out;
}

// History sanitizer (user order 2026-11-01): when a NEW model takes
// over an OLD chat, it must still know the environment (the history
// stays) but must NOT repeat the old format mistake. Old-build stored
// replies contain raw <dots_function_call> blocks, and a model imitates
// the tool format it sees in history — that is how a new model ends up
// writing dots format too. Converting dots blocks in history into the
// correct fenced blocks keeps the information (which tools ran, with
// what args) while demonstrating only the right format, so the new
// model imitates fenced blocks instead. Applied to the history sent to
// the model in ChatView (single chats) and group.ts (group chats), and
// to each loop step's assistant turn, so the format example the model
// sees is always the correct one.
export function sanitizeHistoryForModel(history: { role: string; text: string }[]): { role: string; text: string }[] {
  return history.map((m) => ({ ...m, text: normalizeDotsCalls(m.text) }));
}

export function parseToolCalls(reply: string): AgentToolCall[] {
  const calls: AgentToolCall[] = [];
  // Tolerance (fix 2026-11-01): the prompt shows the JSON on the line
  // after ```tool, but models also emit it on the SAME line
  // ("```tool {...}```" — user screenshot 2026-11-01). The old regex
  // required a newline after ```tool, so a single-line block parsed
  // to nothing and showed as raw text. \s* accepts either layout.
  const re = /```tool\s*([\s\S]*?)```/g;
  let m: RegExpExecArray | null;
  const normalized = normalizeDotsCalls(reply);
  while ((m = re.exec(normalized))) {
    try {
      const obj = JSON.parse(m[1]) as { name?: unknown; args?: unknown };
      if (obj && typeof obj.name === 'string') {
        calls.push({ name: obj.name, args: (obj.args && typeof obj.args === 'object' ? obj.args : {}) as Record<string, unknown> });
      }
    } catch { /* a malformed block is ignored; the loop asks for a retry via the next turn */ }
  }
  return calls;
}

export function stripToolBlocks(reply: string): string {
  // Same single-line tolerance as parseToolCalls: strip a block
  // whether its JSON sits on the ```tool line or the next line.
  return normalizeDotsCalls(reply).replace(/```tool\s*[\s\S]*?```/g, '').trim();
}

function argString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  return typeof v === 'string' ? v : '';
}

// Find a downloaded repo's runnable entry: package.json "main"
// first, then the usual entry filenames, then any root-level .js.
// A repo with no JavaScript but a SKILL.md is a skill set, not a
// runnable plugin — reported as kind 'skill' so the caller installs
// it instead of trying to run it.
async function detectPluginEntry(dir: string): Promise<{ kind: 'code' | 'skill' | 'none'; entry?: string; skillPath?: string }> {
  const files = await listWorkspaceFiles();
  const inDir = files.filter((f) => f.path.startsWith(`${dir}/`)).map((f) => f.path.slice(dir.length + 1));
  if (!inDir.length) return { kind: 'none' };
  if (inDir.includes('package.json')) {
    try {
      const pkg = JSON.parse(await readWorkspaceFile(`${dir}/package.json`)) as { main?: unknown };
      const main = typeof pkg.main === 'string' ? pkg.main.replace(/^\.\//, '') : '';
      if (main && main.endsWith('.js') && inDir.includes(main)) return { kind: 'code', entry: `${dir}/${main}` };
    } catch { /* bad package.json — fall through to filename guesses */ }
  }
  for (const cand of ['index.js', 'main.js', 'plugin.js', 'app.js']) {
    if (inDir.includes(cand)) return { kind: 'code', entry: `${dir}/${cand}` };
  }
  const rootJs = inDir.find((f) => !f.includes('/') && f.endsWith('.js'));
  if (rootJs) return { kind: 'code', entry: `${dir}/${rootJs}` };
  const skill = inDir.find((f) => f === 'SKILL.md') ?? inDir.find((f) => f.toLowerCase().endsWith('/skill.md'));
  if (skill) return { kind: 'skill', skillPath: `${dir}/${skill}` };
  return { kind: 'none' };
}

// approve() shows the user the FULL change (fix 2026-11-01 —
// previews were truncated at 800/400 chars but the full content was
// executed, so content past the cut was never reviewed). The chat
// cards render the full preview in a scrollable view, so nothing
// approved is ever hidden. Read-only tools never call it.
export async function executeAgentTool(
  call: AgentToolCall,
  approve: (summary: string, preview: string) => Promise<boolean>,
  opts?: { section?: string; signal?: AbortSignal },
): Promise<string> {
  // Section scoping (user order 2026-10-30): bot chats work under
  // "bots/<botId>/", group chats under "groups/<threadId>/", Main Chat
  // has no section and sees everything. A sectioned caller can only
  // touch its own section: plain paths are rewritten into it, and
  // paths that already start with it pass through — so a bot or group
  // can never see or overwrite Main Chat's or another chat's files.
  const section = opts?.section ?? '';
  const sectionPath = (raw: string): string | null => {
    const cleaned = safeWorkspacePath(raw);
    if (!cleaned) return null;
    if (!section) return cleaned;
    if (cleaned === section || cleaned.startsWith(`${section}/`)) return cleaned;
    return `${section}/${cleaned}`;
  };
  switch (call.name) {
    case 'list_files': {
      const rawPrefix = argString(call.args, 'path');
      const prefix = section ? (rawPrefix ? `${section}/${rawPrefix}` : `${section}/`) : rawPrefix;
      const files = await listWorkspaceFiles();
      const filtered = prefix ? files.filter((f) => f.path.startsWith(prefix)) : files;
      return filtered.length ? filtered.map((f) => `${f.path} (${f.size} bytes)`).join('\n') : '(workspace is empty)';
    }
    case 'read_file': {
      const p = sectionPath(argString(call.args, 'path'));
      if (!p) return 'Error: invalid path (paths stay inside the workspace, no "..").';
      try { return await readWorkspaceFile(p); }
      catch { return 'Error: could not read that file (it may not exist).'; }
    }
    case 'search_files': {
      const query = argString(call.args, 'query');
      if (!query) return 'Error: search_files needs a query.';
      const files = await listWorkspaceFiles();
      const scoped = section ? files.filter((f) => f.path.startsWith(`${section}/`)) : files;
      const hits: string[] = [];
      for (const f of scoped) {
        try {
          const text = await readWorkspaceFile(f.path);
          const lines = text.split('\n');
          lines.forEach((line, i) => {
            if (line.toLowerCase().includes(query.toLowerCase()) && hits.length < 40) {
              hits.push(`${f.path}:${i + 1}: ${line.trim().slice(0, 160)}`);
            }
          });
        } catch { /* skip unreadable files */ }
      }
      return hits.length ? hits.join('\n') : `(no matches for "${query}")`;
    }
    case 'write_file': {
      const p = sectionPath(argString(call.args, 'path'));
      const content = argString(call.args, 'content');
      if (!p) return 'Error: invalid path.';
      if (!content) return 'Error: write_file needs content.';
      const ok = await approve(`Write ${p}`, content);
      if (!ok) return 'Rejected by user.';
      await writeWorkspaceFile(p, content);
      return `Wrote ${p} (${content.length} chars).`;
    }
    case 'edit_file': {
      const p = sectionPath(argString(call.args, 'path'));
      const oldText = argString(call.args, 'old_text');
      const newText = argString(call.args, 'new_text');
      if (!p || !oldText) return 'Error: edit_file needs path and old_text.';
      let current: string;
      try { current = await readWorkspaceFile(p); }
      catch { return 'Error: could not read that file.'; }
      if (!current.includes(oldText)) return 'Error: old_text was not found in the file — read it first and use its exact text.';
      const ok = await approve(`Edit ${p}`, `Replace:\n${oldText}\nWith:\n${newText}`);
      if (!ok) return 'Rejected by user.';
      await writeWorkspaceFile(p, current.replace(oldText, newText));
      return `Edited ${p}.`;
    }
    case 'delete_file': {
      const p = sectionPath(argString(call.args, 'path'));
      if (!p) return 'Error: invalid path.';
      const ok = await approve(`Delete ${p}`, 'This file will be removed from the workspace.');
      if (!ok) return 'Rejected by user.';
      await deleteWorkspaceFile(p);
      return `Deleted ${p}.`;
    }
    case 'browser_read': {
      const url = argString(call.args, 'url');
      if (!/^https:\/\/[^\/\s]+/.test(url)) return 'Error: browser_read needs a full https:// URL.';
      try {
        const page = await fetchPublicPageText(url, { signal: opts?.signal });
        return `Title: ${page.title}\n${page.text.slice(0, 8000)}`;
      } catch {
        return 'Error: could not read that page (public pages only; no login, paywall, or CAPTCHA).';
      }
    }
    case 'service_request': {
      const service = argString(call.args, 'service');
      const method = argString(call.args, 'method') || 'GET';
      const path = argString(call.args, 'path');
      const rawBody = call.args.body;
      const body = typeof rawBody === 'string' ? rawBody : rawBody ? JSON.stringify(rawBody) : undefined;
      if (!service || !path) return 'Error: service_request needs service and path.';
      // Reads run straight away; anything that sends, creates, or
      // changes data on a service pauses for the user's approval,
      // exactly like file writes.
      if (method.toUpperCase() !== 'GET') {
        const ok = await approve(`Send to ${service}: ${method.toUpperCase()} ${path}`, (body ?? '') || 'No body.');
        if (!ok) return 'Rejected by user.';
      }
      return serviceRequest(service, method, path, body);
    }
    case 'vercel_deploy': {
      const rawFiles = call.args.files;
      const files = (Array.isArray(rawFiles)
        ? rawFiles.filter((f): f is string => typeof f === 'string')
        : typeof rawFiles === 'string'
          ? rawFiles.split(/[,\n]/).map((f) => f.trim()).filter(Boolean)
          : []).map((f) => sectionPath(f)).filter((f): f is string => f !== null);
      const project = argString(call.args, 'project');
      if (!files.length) return 'Error: vercel_deploy needs files (workspace paths).';
      const ok = await approve('Deploy to Vercel', `Files: ${files.join(', ')}\nThis publishes the site live at a public URL.`);
      if (!ok) return 'Rejected by user.';
      return vercelDeploy(files, project || undefined);
    }
    case 'mcp_call': {
      const serverName = argString(call.args, 'server');
      const toolName = argString(call.args, 'tool');
      const rawArgs = call.args.args;
      const argsObj = rawArgs && typeof rawArgs === 'object' ? rawArgs as Record<string, unknown> : {};
      if (!serverName || !toolName) return 'Error: mcp_call needs server and tool.';
      const servers = await listMcpServers();
      const server = servers.find((s) => s.name.toLowerCase() === serverName.toLowerCase());
      if (!server) return `Error: no saved MCP server named "${serverName}".`;
      const ok = await approve(`MCP call ${server.name} → ${toolName}`, JSON.stringify(argsObj) || 'No arguments.');
      if (!ok) return 'Rejected by user.';
      try {
        requireHttpsUrl(server.url, 'MCP server URL');
        const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
        const token = await getMcpToken(server.id);
        if (token) headers.Authorization = `Bearer ${token}`;
        const res = await fetch(server.url, {
          method: 'POST', headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: argsObj } }),
        });
        const text = await res.text();
        if (!res.ok) return `Error: MCP server returned HTTP ${res.status}: ${text.slice(0, 500)}`;
        return text.length > 6000 ? text.slice(0, 6000) + '\n…(truncated)' : text;
      } catch {
        return `Error: could not reach MCP server ${server.name} (network issue).`;
      }
    }
    case 'download_repo': {
      // Lazy require (same pattern as voice.ts): gitDownload pulls
      // in isomorphic-git + browserify crypto shims whose
      // require-time code throws on this phone's process shim
      // (readable-stream 2.3.8 reads process.version.slice).
      // A static import made EVERY Main Chat load crash at launch
      // (2026-10-31) before any UI; requiring it only when a repo
      // download actually runs keeps startup clean. (tsconfig
      // forbids dynamic import() here, so require is used.)
      const { cloneGitHubRepo, parseGitHubRepo } = require('./gitDownload');
      const parsed = parseGitHubRepo(argString(call.args, 'repo'));
      if (!parsed) return 'Error: download_repo needs a GitHub repo ("owner/name" or a github.com URL). Public repos only.';
      const rel = sectionPath(`repos/${parsed.owner}-${parsed.name}`);
      if (!rel) return 'Error: invalid path.';
      const ok = await approve(`Download repo ${parsed.owner}/${parsed.name}`, `Clones the public repo into ${rel} (latest files only, single branch).`);
      if (!ok) return 'Rejected by user.';
      try {
        const dir = await workspaceDir();
        const stats = await cloneGitHubRepo(`${dir}${rel}`, parsed.url);
        return `Downloaded ${parsed.owner}/${parsed.name} into ${rel} (${stats.files} files, ${stats.bytes} bytes). Sample: ${stats.sample.join(', ') || '(empty)'}.`;
      } catch (e) {
        // Report the EXACT clone error (fix 2026-11-01): the old text
        // let the model guess ("too large", "missing .git") instead of
        // quoting the real failure, so the cause stayed hidden.
        return `Error: clone failed for ${parsed.owner}/${parsed.name}. Exact error: ${e instanceof Error ? e.message : 'download failed'}. Report this exact error to the user; do not guess a cause.`;
      }
    }
    case 'run_plugin': {
      // Lazy require for the same reason as download_repo (see above).
      const { cloneGitHubRepo, parseGitHubRepo } = require('./gitDownload');
      const target = argString(call.args, 'plugin') || argString(call.args, 'file') || argString(call.args, 'repo');
      if (!target) return 'Error: run_plugin needs a plugin name, a github.com repo ("owner/name" or URL), or a workspace .js file.';
      // Resolve to a repo when possible: an installed plugin's repo
      // first, then a github.com reference in the argument itself.
      let repoRef: { owner: string; name: string; url: string } | null = null;
      try {
        const installed = (await listPlugins()).find((p) => p.name.toLowerCase() === target.toLowerCase());
        if (installed?.repoUrl) repoRef = parseGitHubRepo(installed.repoUrl);
      } catch { /* db read failed — fall through to other resolutions */ }
      if (!repoRef) repoRef = parseGitHubRepo(target);
      let code = '';
      let label = target;
      if (repoRef) {
        const ref = repoRef;
        const rel = sectionPath(`repos/${ref.owner}-${ref.name}`);
        if (!rel) return 'Error: invalid path.';
        label = `${ref.owner}/${ref.name}`;
        const files = await listWorkspaceFiles();
        const already = files.some((f) => f.path.startsWith(`${rel}/`));
        if (!already) {
          const okDl = await approve(`Download repo ${ref.owner}/${ref.name}`, `Clones the public repo into ${rel} (latest files only, single branch) so it can run here.`);
          if (!okDl) return 'Rejected by user.';
          try {
            const dir = await workspaceDir();
            await cloneGitHubRepo(`${dir}${rel}`, ref.url);
          } catch (e) {
            return `Error: clone failed for ${ref.owner}/${ref.name}. Exact error: ${e instanceof Error ? e.message : 'download failed'}. Report this exact error to the user; do not guess a cause.`;
          }
        }
        try {
          const existing = (await listPlugins()).find((p) => p.repoUrl === ref.url);
          if (!existing) {
            await savePlugin({ id: newId(), name: ref.name, description: `GitHub repo ${ref.owner}/${ref.name} (runs on-phone in the WebView sandbox).`, author: ref.owner, repoUrl: ref.url, manifest: '', permissions: '', hasExecutableCode: true, createdAt: nowIso() });
          }
        } catch { /* registration is best-effort; running still works */ }
        const detected = await detectPluginEntry(rel);
        if (detected.kind === 'skill' && detected.skillPath) {
          try {
            const skillText = await readWorkspaceFile(detected.skillPath);
            const existingSkill = (await listSkills()).find((s) => s.repoUrl === ref.url);
            if (!existingSkill) {
              await saveSkill({ id: newId(), botId: null, name: ref.name, template: skillText, source: 'github', repoUrl: ref.url, permissions: '', createdAt: nowIso() });
            }
          } catch { /* skill install failed — report below */ }
          return `This repo has no runnable JavaScript — it is a skill set. Installed as skill "${ref.name}": use "/${ref.name} ..." at the start of a chat message to use it.`;
        }
        if (detected.kind !== 'code' || !detected.entry) {
          return `Error: no runnable JavaScript entry found in ${rel} (looked for package.json main, index.js, main.js, plugin.js, and any root .js file).`;
        }
        try { code = await readWorkspaceFile(detected.entry); }
        catch { return 'Error: could not read the plugin entry file.'; }
        label = `${label} (${detected.entry})`;
      } else {
        const p = sectionPath(target);
        if (!p) return 'Error: invalid path (paths stay inside the workspace, no "..").';
        if (!p.endsWith('.js')) return 'Error: run_plugin needs a .js file, a plugin name, or a github.com repo.';
        try { code = await readWorkspaceFile(p); }
        catch { return 'Error: could not read that file (it may not exist).'; }
        label = p;
      }
      const okRun = await approve(`Run plugin ${label}`, `Runs this JavaScript on the phone in the WebView sandbox (no host, no server, no network access). It can only use the bridged workspace file + public-page actions; it cannot touch app data or keys. ${section ? `It can only read files under ${section}/.` : 'Main Chat: it can read files in all workspace sections.'}`);
      if (!okRun) return 'Rejected by user.';
      const res = await runPluginCode({ code, section, approve });
      const logPart = res.logs.length ? `\nPlugin log:\n${res.logs.join('\n')}` : '';
      return res.ok
        ? `Plugin result: ${(res.result ?? '(no result)').slice(0, 4000)}${logPart}`
        : `Plugin failed: ${res.error ?? 'unknown error'}${logPart}`;
    }
    default:
      return `Error: unknown tool "${call.name}". Available: list_files, read_file, search_files, write_file, edit_file, delete_file, browser_read, download_repo, run_plugin, service_request, vercel_deploy, mcp_call.`;
  }
}
