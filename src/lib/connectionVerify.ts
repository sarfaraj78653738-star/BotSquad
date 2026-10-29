import { CatalogService } from './connectionCatalog';
import { Language } from './tokens';
import { t } from './i18n';

// Live verification for the Connect flow (user order 2026-10-29):
// tapping Connect asks only for what that service needs, then the app
// calls the service's own API with those details. The connection is
// built ONLY when the service accepts them — a wrong key fails with a
// clear error instead of a fake "connected" row. All calls go directly
// from the phone to the service; nothing passes through any BotSquad
// server (there is none). Multi-field connections store all fields as
// one JSON string in SecureStore (see connect.tsx); single-token ones
// store the raw token, as before.
export type VerifyResult = { ok: boolean; account?: string; error?: string };

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

// Host fields arrive as users type them ("https://chat.example.com/",
// "example.myshopify.com", "company.atlassian.net") — normalize to a
// bare host before it is substituted into a URL template.
function bareHost(raw: string): string {
  return raw.trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
}

function normalizeValues(service: CatalogService, values: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[k] = (v ?? '').trim();
  for (const hostKey of ['store', 'instance', 'server', 'domain']) {
    if (out[hostKey]) out[hostKey] = bareHost(out[hostKey]);
  }
  if (out.store && !out.store.includes('.')) out.store = `${out.store}.myshopify.com`;
  if (out.url) out.url = out.url.replace(/\/+$/, '');
  if (out.key && out.key.includes('-')) {
    // Mailchimp keys end with the datacenter, like "...-us12".
    out.dc = out.key.split('-').pop() ?? '';
  }
  return out;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
}

function fillHeaders(headers: Record<string, string> | undefined, values: Record<string, string>, basic?: [string, string]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers ?? {})) out[k] = fill(v, values);
  if (basic) out.Authorization = `Basic ${base64Ascii(`${values[basic[0]] ?? ''}:${values[basic[1]] ?? ''}`)}`;
  return out;
}

function getPath(obj: unknown, path: string): unknown {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

async function callApi(url: string, method: string, headers: Record<string, string>, body?: string): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(url, { method, headers, body: body ?? undefined, signal: controller.signal });
    let json: unknown = null;
    try { json = await res.json(); } catch { /* non-JSON body */ }
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

function httpError(status: number, lang: Language): string {
  if (status === 401 || status === 403) return t(lang, 'verifyBadDetails');
  if (status === 404) return t(lang, 'verifyDomain');
  return `${t(lang, 'verifyRefused')} (HTTP ${status}).`;
}

export async function verifyConnection(service: CatalogService, rawValues: Record<string, string>, lang: Language = 'en'): Promise<VerifyResult> {
  const values = normalizeValues(service, rawValues);
  const spec = service.verify;
  try {
    if (spec.type === 'session') {
      const { status, json } = await callApi(fill(spec.url, values), 'POST', { 'Content-Type': 'application/json' }, fill(spec.body, values));
      if (status < 200 || status >= 300) return { ok: false, error: httpError(status, lang) };
      const account = spec.accountPath ? getPath(json, spec.accountPath) : undefined;
      return { ok: true, account: typeof account === 'string' ? account : undefined };
    }
    if (spec.type === 'token-exchange') {
      const tokenHeaders = fillHeaders(spec.tokenHeaders, values, spec.basic);
      if (spec.tokenBody) tokenHeaders['Content-Type'] = tokenHeaders['Content-Type'] ?? 'application/x-www-form-urlencoded';
      const tokenRes = await callApi(fill(spec.tokenUrl, values), 'POST', tokenHeaders, spec.tokenBody || undefined);
      if (tokenRes.status < 200 || tokenRes.status >= 300) return { ok: false, error: httpError(tokenRes.status, lang) };
      const accessToken = getPath(tokenRes.json, 'access_token');
      if (!spec.meUrl) return { ok: true };
      if (typeof accessToken !== 'string') return { ok: false, error: t(lang, 'verifyNoToken') };
      const meRes = await callApi(fill(spec.meUrl, values), 'GET', { ...(spec.meHeaders ?? {}), Authorization: `Bearer ${accessToken}` });
      if (meRes.status < 200 || meRes.status >= 300) return { ok: false, error: httpError(meRes.status, lang) };
      const account = spec.accountPath ? getPath(meRes.json, spec.accountPath) : undefined;
      return { ok: true, account: typeof account === 'string' ? account : undefined };
    }
    // Plain API call.
    const headers = fillHeaders(spec.headers, values, spec.basic);
    const { status, json } = await callApi(fill(spec.url, values), spec.method ?? 'GET', headers, spec.body ? fill(spec.body, values) : undefined);
    if (status < 200 || status >= 300) return { ok: false, error: httpError(status, lang) };
    if (spec.okPath) {
      const okVal = getPath(json, spec.okPath);
      if (okVal !== true) return { ok: false, error: t(lang, 'verifyBadDetails') };
    }
    const account = spec.accountPath ? getPath(json, spec.accountPath) : undefined;
    return { ok: true, account: typeof account === 'string' ? account : undefined };
  } catch {
    return { ok: false, error: t(lang, 'verifyNetwork') };
  }
}
