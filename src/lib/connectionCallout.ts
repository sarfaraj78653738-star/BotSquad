import { Connection } from './types';

// Connection callouts (user order 2026-10-29): connectors work by
// callout too, like MCP servers and skills. "/github ..." or
// "GitHub, ..." at the START of the message grants that connection
// for this turn only — in bot and group chats. It does NOT replace
// standing per-bot enablement: an enabled connection is available
// every turn with no callout; a callout adds a connection for one
// turn even when it is not standing-enabled for that bot. The
// callout is typed by the user, so it is explicit per-turn
// authorization — the model can never grant itself a connection.
// A connection is matched by its service key ("github") or its
// saved name ("My GitHub"), normalized the same way as skill and
// MCP callouts. Anything that is not a callout passes through
// unchanged.
const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

export function parseConnectionCallout(text: string, connections: Connection[]): { connection: Connection | null; cleanText: string } {
  const trimmed = text.trim();
  if (!trimmed) return { connection: null, cleanText: trimmed };

  const keys = (c: Connection) => [c.service, c.name].map(norm);

  // Slash form: /name rest...
  const slash = trimmed.match(/^\/(\S+)\s*([\s\S]*)$/);
  if (slash) {
    const token = norm(slash[1]);
    const exact = connections.find((c) => keys(c).includes(token));
    const prefix = connections
      .filter((c) => keys(c).some((k) => k.startsWith(token)))
      .sort((a, b) => Math.min(...keys(a).map((k) => k.length)) - Math.min(...keys(b).map((k) => k.length)));
    const connection = exact ?? prefix[0] ?? null;
    if (connection) return { connection, cleanText: slash[2].trim() || 'Use this connection.' };
    return { connection: null, cleanText: trimmed };
  }

  // Name-prefix form: "GitHub, rest..." — longest name wins.
  const lower = trimmed.toLowerCase();
  const ordered = [...connections].sort((a, b) => b.name.length - a.name.length);
  for (const c of ordered) {
    for (const candidate of [c.name, c.service]) {
      const name = candidate.toLowerCase();
      if (lower === name) return { connection: c, cleanText: 'Use this connection.' };
      if (lower.startsWith(name)) {
        const next = trimmed[name.length];
        if (next === ' ' || next === ',' || next === ':' || next === '\n') {
          const rest = trimmed.slice(name.length).replace(/^[\s,:]+/, '').trim();
          return { connection: c, cleanText: rest || 'Use this connection.' };
        }
      }
    }
  }
  return { connection: null, cleanText: trimmed };
}
