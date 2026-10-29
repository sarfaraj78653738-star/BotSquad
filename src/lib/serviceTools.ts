import * as FileSystem from 'expo-file-system';
import { listConnections } from './db';
import { getConnectionToken } from './connections';
import { Connection } from './types';
import { workspaceDir } from './workspace';

// Service tools for Main Chat (user order 2026-10-29: "make the agent
// work on the service's tools, not just a connection"). A connection
// alone does nothing — these tools turn a verified connection into
// action: the agent calls a connected service's own API directly from
// the phone, with the stored details. There is one generic tool
// (service_request: any endpoint of any connected service) plus the
// one coded tool users actually asked for first (vercel_deploy).
// Safety, matching the file tools: reads (GET) run straight away;
// anything that sends, creates, or publishes (POST/PUT/PATCH/DELETE,
// and every deploy) pauses for the user's approval card first, and
// never runs on a decline. Paths are relative to the service's own API
// base only — the model cannot point a call at an arbitrary host, and
// credentials never appear in any tool result or reply.
type Creds = Record<string, string>;

type AuthSpec =
  | { kind: 'bearer' }
  | { kind: 'raw' }
  | { kind: 'bot' }
  | { kind: 'token' }
  | { kind: 'figma' }
  | { kind: 'shopify' }
  | { kind: 'supabase' }
  | { kind: 'apikey' }
  | { kind: 'basic'; fields: [string, string] }
  | { kind: 'query'; fields: [string, string] }
  | { kind: 'queryParam'; param: string }
  | { kind: 'rocket' }
  | { kind: 'tokenCap' }
  | { kind: 'goog' }
  | { kind: 'telegram' }
  | { kind: 'session' }
  | { kind: 'exchange'; tokenUrl: string; tokenBody: string; basic: [string, string] };

type ServiceDef = { base: string | ((c: Creds) => string); auth: AuthSpec; extraHeaders?: Record<string, string> };

const H = (host: string) => `https://${host}`;
const bare = (v: string) => v.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');

const DEFS: Record<string, ServiceDef> = {
  'github': { base: 'https://api.github.com', auth: { kind: 'bearer' } },
  'gitlab': { base: 'https://gitlab.com/api/v4', auth: { kind: 'bearer' } },
  'bitbucket': { base: 'https://api.bitbucket.org/2.0', auth: { kind: 'bearer' } },
  'codeberg': { base: (c) => H(`${bare(c.instance ?? 'codeberg.org')}/api/v1`), auth: { kind: 'token' } },
  'gitea': { base: (c) => H(`${bare(c.instance ?? '')}/api/v1`), auth: { kind: 'token' } },
  'vercel': { base: 'https://api.vercel.com', auth: { kind: 'bearer' } },
  'netlify': { base: 'https://api.netlify.com/api/v1', auth: { kind: 'bearer' } },
  'cloudflare': { base: 'https://api.cloudflare.com/client/v4', auth: { kind: 'bearer' } },
  'render': { base: 'https://api.render.com/v1', auth: { kind: 'bearer' } },
  'supabase': { base: (c) => `${c.url?.replace(/\/+$/, '')}/rest/v1`, auth: { kind: 'supabase' } },
  'neon': { base: 'https://console.neon.tech/api/v2', auth: { kind: 'bearer' } },
  'slack': { base: 'https://slack.com/api', auth: { kind: 'bearer' } },
  'discord': { base: 'https://discord.com/api/v10', auth: { kind: 'bot' } },
  'telegram': { base: (c) => `https://api.telegram.org/bot${c.token ?? ''}`, auth: { kind: 'telegram' } },
  'mattermost': { base: (c) => H(`${bare(c.server ?? '')}/api/v4`), auth: { kind: 'bearer' } },
  'zulip': { base: (c) => H(`${bare(c.server ?? '')}/api/v1`), auth: { kind: 'basic', fields: ['email', 'token'] } },
  'rocket.chat': { base: (c) => H(`${bare(c.server ?? '')}/api/v1`), auth: { kind: 'rocket' } },
  'whatsapp business': { base: 'https://graph.facebook.com/v19.0', auth: { kind: 'bearer' } },
  'notion': { base: 'https://api.notion.com/v1', auth: { kind: 'bearer' }, extraHeaders: { 'Notion-Version': '2022-06-28' } },
  'asana': { base: 'https://app.asana.com/api/1.0', auth: { kind: 'bearer' } },
  'clickup': { base: 'https://api.clickup.com/api/v2', auth: { kind: 'raw' } },
  'linear': { base: 'https://api.linear.app', auth: { kind: 'raw' } },
  'monday': { base: 'https://api.monday.com/v2', auth: { kind: 'raw' } },
  'todoist': { base: 'https://api.todoist.com/rest/v2', auth: { kind: 'bearer' } },
  'trello': { base: 'https://api.trello.com/1', auth: { kind: 'query', fields: ['key', 'token'] } },
  'jira cloud': { base: (c) => H(`${bare(c.domain ?? '')}/rest/api/3`), auth: { kind: 'basic', fields: ['email', 'token'] } },
  'airtable': { base: 'https://api.airtable.com/v0', auth: { kind: 'bearer' } },
  'coda': { base: 'https://coda.io/apis/v1', auth: { kind: 'bearer' } },
  'smartsheet': { base: 'https://api.smartsheet.com/2.0', auth: { kind: 'bearer' } },
  'calendly': { base: 'https://api.calendly.com', auth: { kind: 'bearer' } },
  'cal.com': { base: 'https://api.cal.com/v1', auth: { kind: 'bearer' } },
  'stripe': { base: 'https://api.stripe.com/v1', auth: { kind: 'bearer' } },
  'razorpay': { base: 'https://api.razorpay.com/v1', auth: { kind: 'basic', fields: ['keyId', 'secret'] } },
  'paypal': { base: 'https://api-m.paypal.com/v1', auth: { kind: 'exchange', tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token', tokenBody: 'grant_type=client_credentials', basic: ['clientId', 'secret'] } },
  'lemon squeezy': { base: 'https://api.lemonsqueezy.com/v1', auth: { kind: 'bearer' } },
  'gumroad': { base: 'https://api.gumroad.com/v2', auth: { kind: 'bearer' } },
  'shopify': { base: (c) => H(`${bare(c.store ?? '')}/admin/api/2024-01`), auth: { kind: 'shopify' } },
  'mailchimp': { base: (c) => `https://${(c.token ?? '').split('-').pop() ?? ''}.api.mailchimp.com/3.0`, auth: { kind: 'apikey' } },
  'typeform': { base: 'https://api.typeform.com', auth: { kind: 'bearer' } },
  'sendgrid': { base: 'https://api.sendgrid.com/v3', auth: { kind: 'bearer' } },
  'resend': { base: 'https://api.resend.com', auth: { kind: 'bearer' } },
  'dropbox': { base: 'https://api.dropboxapi.com/2', auth: { kind: 'bearer' } },
  'box': { base: 'https://api.box.com/2.0', auth: { kind: 'bearer' } },
  'openai': { base: 'https://api.openai.com/v1', auth: { kind: 'bearer' } },
  'anthropic': { base: 'https://api.anthropic.com/v1', auth: { kind: 'bearer' }, extraHeaders: { 'anthropic-version': '2023-06-01' } },
  'openrouter': { base: 'https://openrouter.ai/api/v1', auth: { kind: 'bearer' } },
  'gemini': { base: 'https://generativelanguage.googleapis.com/v1', auth: { kind: 'goog' } },
  'hugging face': { base: 'https://huggingface.co/api', auth: { kind: 'bearer' } },
  'replicate': { base: 'https://api.replicate.com/v1', auth: { kind: 'tokenCap' } },
  'mastodon': { base: (c) => H(`${bare(c.instance ?? '')}/api/v1`), auth: { kind: 'bearer' } },
  'bluesky': { base: 'https://bsky.social/xrpc', auth: { kind: 'session' } },
  'figma': { base: 'https://api.figma.com/v1', auth: { kind: 'figma' } },
  'miro': { base: 'https://api.miro.com/v2', auth: { kind: 'bearer' } },
  'twilio': { base: 'https://api.twilio.com/2010-04-01', auth: { kind: 'basic', fields: ['sid', 'token'] } },
  'zoom': { base: 'https://api.zoom.us/v2', auth: { kind: 'exchange', tokenUrl: 'https://zoom.us/oauth/token?grant_type=account_credentials&account_id=', tokenBody: '', basic: ['clientId', 'secret'] } },
  'openweather': { base: 'https://api.openweathermap.org/data/2.5', auth: { kind: 'queryParam', param: 'appid' } },
  'newsapi': { base: 'https://newsapi.org/v2', auth: { kind: 'queryParam', param: 'apiKey' } },
  'unsplash': { base: 'https://api.unsplash.com', auth: { kind: 'queryParam', param: 'client_id' } },
};

function base64Ascii(input: string): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let out = '';
  for (let i = 0; i < input.length; i += 3) {
    const a = input.charCodeAt(i);
    const b = i + 1 < input.length ? input.charCodeAt(i + 1) : 0;
    const c = i + 2 < input.length ? input.charCodeAt(i + 2) : 0;
    const n = (a << 16) | (b << 8) | c;
    out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + (i + 1 < input.length ? chars[(n >> 6) & 63] : '=') + (i + 2 < input.length ? chars[n & 63] : '=');
  }
  return out;
}

async function fetchTimeout(url: string, init: RequestInit, ms = 20000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

function parseCreds(stored: string | null): Creds | null {
  if (!stored) return null;
  const t = stored.trim();
  if (t.startsWith('{')) {
    try { return JSON.parse(t) as Creds; } catch { return { token: t }; }
  }
  return { token: t };
}

export async function resolveConnection(service: string): Promise<{ conn: Connection; creds: Creds } | null> {
  const all = await listConnections();
  const conn = all.find((c) => c.service.toLowerCase() === service.toLowerCase())
    ?? all.find((c) => c.name.toLowerCase() === service.toLowerCase());
  if (!conn) return null;
  const creds = parseCreds(await getConnectionToken(conn.id));
  if (!creds) return null;
  return { conn, creds };
}

export async function connectedServicesPrompt(): Promise<string> {
  const all = await listConnections();
  if (!all.length) return '\n\n[CONNECTED SERVICES: none yet. If the user asks to use a service, tell them to connect it first in Settings → Connections.]';
  const lines = all.map((c) => `- ${c.service} (as "${c.name}")`).join('\n');
  return `\n\n[CONNECTED SERVICES — these are live and usable with service_request right now:]\n${lines}`;
}

function authHeaders(def: ServiceDef, creds: Creds, extraToken?: string): Record<string, string> {
  const token = creds.token ?? '';
  const headers: Record<string, string> = { ...(def.extraHeaders ?? {}) };
  switch (def.auth.kind) {
    case 'bearer': headers.Authorization = `Bearer ${extraToken ?? token}`; break;
    case 'raw': headers.Authorization = extraToken ?? token; break;
    case 'bot': headers.Authorization = `Bot ${token}`; break;
    case 'token': headers.Authorization = `token ${token}`; break;
    case 'figma': headers['X-Figma-Token'] = token; break;
    case 'shopify': headers['X-Shopify-Access-Token'] = token; break;
    case 'supabase': headers.apikey = token; headers.Authorization = `Bearer ${token}`; break;
    case 'apikey': headers.Authorization = `apikey ${token}`; break;
    case 'tokenCap': headers.Authorization = `Token ${token}`; break;
    case 'goog': headers['x-goog-api-key'] = token; break;
    case 'rocket': headers['X-User-Id'] = creds.userId ?? ''; headers['X-Auth-Token'] = creds.authToken ?? ''; break;
    case 'basic': {
      const [a, b] = def.auth.fields;
      headers.Authorization = `Basic ${base64Ascii(`${creds[a] ?? ''}:${creds[b] ?? ''}`)}`;
      break;
    }
    case 'query': case 'queryParam': case 'telegram': case 'session': case 'exchange': break;
  }
  return headers;
}

// The generic service tool: any endpoint of any connected service.
// The model passes a PATH only ("/user/repos"), never a full URL.
export async function serviceRequest(service: string, method: string, path: string, body?: string): Promise<string> {
  const m = (method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(m)) return `Error: unsupported method "${method}".`;
  const p = (path || '').trim();
  if (!p.startsWith('/') || p.includes('://') || p.includes('..')) return 'Error: path must be a relative API path like "/user/repos" (no full URL, no "..").';
  const resolved = await resolveConnection(service).catch(() => null);
  if (!resolved) return `Error: no connection for "${service}". Connect it first in Settings → Connections.`;
  const def = DEFS[service.toLowerCase()];
  if (!def) return `Error: "${service}" has no tool mapping yet.`;
  const { creds } = resolved;
  // Routing IDs the agent cannot know (it never sees credentials) are
  // filled from the connection: WhatsApp {phoneId}, Twilio {sid}, and
  // host fields. Secrets (tokens, keys, passwords) are NEVER
  // substituted into a path.
  const filledPath = p.replace(/\{(\w+)\}/g, (_, k) => ['phoneId', 'sid', 'accountId', 'store', 'instance', 'server', 'domain'].includes(k) ? (creds[k] ?? '') : `{${k}}`);
  try {
    let headers = authHeaders(def, creds);
    let url = `${typeof def.base === 'function' ? def.base(creds) : def.base}${filledPath}`;
    // Session and token-exchange services mint a short-lived token per call.
    if (def.auth.kind === 'session') {
      const sessionRes = await fetchTimeout('https://bsky.social/xrpc/com.atproto.server.createSession', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: creds.handle ?? '', password: creds.password ?? '' }),
      });
      if (!sessionRes.ok) return 'Error: Bluesky login failed — check the handle and app password in Connections.';
      const session = await sessionRes.json() as { accessJwt?: unknown };
      if (typeof session.accessJwt !== 'string') return 'Error: Bluesky did not return a session.';
      headers = { ...headers, Authorization: `Bearer ${session.accessJwt}` };
    } else if (def.auth.kind === 'exchange') {
      const [a, b] = def.auth.basic;
      const tokenUrl = def.auth.tokenUrl + (service.toLowerCase() === 'zoom' ? (creds.accountId ?? '') : '');
      const tokenRes = await fetchTimeout(tokenUrl, {
        method: 'POST',
        headers: { Authorization: `Basic ${base64Ascii(`${creds[a] ?? ''}:${creds[b] ?? ''}`)}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: def.auth.tokenBody || undefined,
      });
      if (!tokenRes.ok) return 'Error: could not get a token from the service — check the stored details in Connections.';
      const tokenJson = await tokenRes.json() as { access_token?: unknown };
      if (typeof tokenJson.access_token !== 'string') return 'Error: service did not return a token.';
      headers = { ...headers, Authorization: `Bearer ${tokenJson.access_token}` };
    } else if (def.auth.kind === 'query') {
      const [a, b] = def.auth.fields;
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}key=${encodeURIComponent(creds[a] ?? '')}&token=${encodeURIComponent(creds[b] ?? '')}`;
    } else if (def.auth.kind === 'queryParam') {
      const sep = url.includes('?') ? '&' : '?';
      url = `${url}${sep}${def.auth.param}=${encodeURIComponent(creds.token ?? '')}`;
    }
    if (m !== 'GET') headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
    const res = await fetchTimeout(url, { method: m, headers, body: m === 'GET' ? undefined : body });
    let text = '';
    try { text = await res.text(); } catch { /* empty body */ }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) return `Error: ${service} refused the stored details (HTTP ${res.status}) — re-connect with fresh details.`;
      return `Error: ${service} returned HTTP ${res.status}: ${text.slice(0, 500)}`;
    }
    const trimmed = text.length > 6000 ? text.slice(0, 6000) + '\n…(truncated)' : text;
    return `HTTP ${res.status}\n${trimmed}`;
  } catch {
    return `Error: could not reach ${service} (network issue).`;
  }
}

// Deploy workspace files to Vercel as a live production site. This is
// the "make my website live" tool: the agent builds files in the
// workspace, then this publishes them. Always approval-gated by the
// caller (agent.ts) — it never runs without the user's tap.
export async function vercelDeploy(files: string[], projectName?: string): Promise<string> {
  const resolved = await resolveConnection('Vercel').catch(() => null);
  if (!resolved) return 'Error: no Vercel connection. Connect Vercel first in Settings → Connections.';
  const token = resolved.creds.token ?? '';
  if (!token) return 'Error: Vercel connection has no token.';
  const clean = [...new Set(files.map((f) => f.trim()).filter(Boolean))];
  if (!clean.length) return 'Error: vercel_deploy needs at least one workspace file.';
  if (clean.length > 50) return 'Error: too many files (max 50 per deploy).';
  try {
    const dir = await workspaceDir();
    const payload: { file: string; data: string }[] = [];
    for (const f of clean) {
      if (f.includes('..') || f.startsWith('/')) return `Error: invalid file path "${f}".`;
      const full = `${dir}${f}`;
      const info = await FileSystem.getInfoAsync(full);
      if (!info.exists || info.isDirectory) return `Error: workspace file not found: ${f}`;
      if ((info.size ?? 0) > 5 * 1024 * 1024) return `Error: file too large for deploy: ${f}`;
      const data = await FileSystem.readAsStringAsync(full, { encoding: FileSystem.EncodingType.Base64 });
      payload.push({ file: f, data });
    }
    const res = await fetchTimeout('https://api.vercel.com/v13/deployments', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: (projectName ?? 'botsquad-site').trim() || 'botsquad-site', files: payload, target: 'production', projectSettings: { framework: null } }),
    });
    const json = await res.json().catch(() => null) as { url?: unknown; error?: { message?: unknown } } | null;
    if (!res.ok) {
      const msg = json?.error?.message;
      return `Error: Vercel deploy failed (HTTP ${res.status})${typeof msg === 'string' ? `: ${msg}` : '.'}`;
    }
    if (json && typeof json.url === 'string') return `Deployed live: https://${json.url}`;
    return 'Error: Vercel did not return a live URL.';
  } catch {
    return 'Error: could not reach Vercel (network issue).';
  }
}
