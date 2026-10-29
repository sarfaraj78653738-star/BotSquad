import { McpServer, McpTool } from './types';

// MCP callouts (user order 2026-10-29): MCP servers work like skills
// now. The MCP screen is just the saved-servers library — no
// per-bot enabling anymore. An added server is automatically
// available to every chat. To use one, the user calls it out at the
// START of the chat message: "/server-name do X" or
// "Server Name, do X". This parses that callout and returns the
// server plus the message with the callout stripped, for this turn
// only. Anything that is not a callout passes through unchanged, so
// ordinary chat never breaks.
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

export function parseMcpCallout(text: string, servers: McpServer[]): { server: McpServer | null; cleanText: string } {
  const trimmed = text.trim();
  if (!trimmed) return { server: null, cleanText: trimmed };

  // Slash form: /name rest...
  const slash = trimmed.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (slash) {
    const token = norm(slash[1]);
    const exact = servers.find((s) => norm(s.name) === token);
    const prefix = servers
      .filter((s) => norm(s.name).startsWith(token))
      .sort((a, b) => norm(a.name).length - norm(b.name).length);
    const server = exact ?? prefix[0] ?? null;
    if (server) return { server, cleanText: slash[2].trim() || 'Use this MCP server.' };
    return { server: null, cleanText: trimmed };
  }

  // Name-prefix form: "Server Name, rest..." — longest name wins.
  const lower = trimmed.toLowerCase();
  const ordered = [...servers].sort((a, b) => b.name.length - a.name.length);
  for (const s of ordered) {
    const name = s.name.toLowerCase();
    if (lower === name) return { server: s, cleanText: 'Use this MCP server.' };
    if (lower.startsWith(name)) {
      const next = trimmed[name.length];
      if (next === ' ' || next === ',' || next === ':' || next === '\n') {
        const rest = trimmed.slice(name.length).replace(/^[\s,:]+/, '').trim();
        return { server: s, cleanText: rest || 'Use this MCP server.' };
      }
    }
  }
  return { server: null, cleanText: trimmed };
}

// Prompt block for a called-out server, appended for this turn only.
// runnable is true only in Main Chat, where the agent loop has the
// mcp_call tool; bot and group chats are single-reply, so there the
// tools are listed for reference and no run is promised.
export function mcpPromptBlock(serverName: string, tools: McpTool[], runnable: boolean): string {
  if (!tools.length) {
    return `\n\n[MCP SERVER — ${serverName} (called out this turn). Its tool list could not be loaded; do not invent tools for it.]`;
  }
  const list = tools.map((t) => `${t.name}: ${t.description || 'No description.'}`).join('; ');
  const runLine = runnable
    ? ` To run one, emit an mcp_call tool block; every call waits for the user's approval.`
    : '';
  return `\n\n[MCP SERVER — ${serverName} (called out this turn). Tools: ${list}.${runLine}]`;
}
