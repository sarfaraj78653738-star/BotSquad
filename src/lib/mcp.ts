import { McpTool } from './types';
import { getMcpToken } from './connections';

// MCP in Phase 1: HTTP/SSE only. No stdio — a phone has no local MCP
// subprocess model to run safely. Servers are contacted over HTTPS with
// the Streamable HTTP JSON-RPC protocol (initialize, then tools/list).
// Every tool CALL is approval-gated elsewhere in the app: this module only
// lists tools and prepares a call; the UI must show the call and get the
// user's tap before any call is sent.
// SECURITY FIX 2026-10-28: MCP tokens must never travel over plain http,
// where any network observer could read them. Only https:// is accepted.
export function requireHttpsUrl(url: string, what: string): void {
  if (!/^https:\/\//i.test(url)) {
    throw new Error(`${what} must be an https:// URL. Plain http is rejected so tokens are never sent in clear text.`);
  }
}

export async function listMcpTools(serverId: string, url: string): Promise<McpTool[]> {
  requireHttpsUrl(url, 'MCP server URL');
  const token = await getMcpToken(serverId);
  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const init = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'TeamBots', version: '0.1.0' } } }),
  });
  if (!init.ok) throw new Error(`MCP server returned HTTP ${init.status}. Check the URL and token.`);
  const list = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
  });
  if (!list.ok) throw new Error(`MCP tools/list returned HTTP ${list.status}.`);
  const text = await list.text();
  // SSE responses may wrap JSON in "data:" lines; JSON-RPC may be plain JSON.
  const jsonText = text.includes('data:') ? (text.split('data:').pop() ?? '') : text;
  let data: any;
  try {
    data = JSON.parse(jsonText) as any;
  } catch {
    throw new Error('MCP server returned an unreadable tools/list response.');
  }
  const tools = (data.result?.tools ?? []) as any[];
  return tools.map((t) => ({ name: String(t.name), description: String(t.description ?? ''), serverId }));
}

// Prepared, NOT sent, until the user approves it in the UI.
// _serverId is internal binding only: it lets the approval handler fetch
// the right stored token, and it is stripped before anything is sent.
export function prepareMcpCall(serverUrl: string, toolName: string, args: Record<string, unknown>, serverId: string) {
  return { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: toolName, arguments: args }, _serverUrl: serverUrl, _serverId: serverId };
}
