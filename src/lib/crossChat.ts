import { listBots, listChats, listGroupMessages, listGroupThreads, listMessages, listUniversalChats } from './db';

// Cross-chat context for Main Chat (user order 2026-10-29): when the
// user asks Main Chat about something from a bot chat or a group
// thread, Main Chat should actually know it. This digest gives Main
// Chat the recent tail of every other thread — titles plus the last 3
// messages each — capped so it never eats the whole context window.
// Everything here stays on the device; nothing is sent anywhere but
// to the model provider the user already chose for this chat.
function snip(s: string): string {
  return s.length > 300 ? s.slice(0, 300) + '…' : s;
}

function tailText(items: { label: string; text: string }[]): string {
  return items.slice(-3).map((i) => `${i.label}: ${snip(i.text)}`).join('\n');
}

export async function buildCrossChatDigest(currentThreadId: string): Promise<string> {
  const sections: string[] = [];

  try {
    const threads = await listUniversalChats();
    for (const t of threads.filter((x) => x.id !== currentThreadId).slice(0, 5)) {
      const msgs = await listMessages(t.id);
      const text = tailText(msgs.map((m) => ({ label: m.role === 'user' ? 'User' : 'Main Chat', text: m.text })));
      if (text) sections.push(`Main Chat thread "${t.title ?? 'Main Chat'}":\n${text}`);
    }
  } catch { /* a thread failing to load never blocks the chat */ }

  try {
    const bots = await listBots();
    const chats = await listChats();
    for (const c of chats.filter((x) => x.status === 'active').slice(0, 8)) {
      const msgs = await listMessages(c.id);
      const botName = bots.find((b) => b.id === c.botId)?.name ?? 'Bot';
      const text = tailText(msgs.map((m) => ({ label: m.role === 'user' ? 'User' : botName, text: m.text })));
      if (text) sections.push(`Bot chat "${botName}":\n${text}`);
    }
  } catch { /* ignore */ }

  try {
    const bots = await listBots();
    const threads = await listGroupThreads();
    for (const t of threads.slice(0, 5)) {
      const msgs = await listGroupMessages(t.id);
      const text = tailText(msgs.map((m) => ({
        label: m.role === 'user' ? 'User' : m.botId ? (bots.find((b) => b.id === m.botId)?.name ?? 'Bot') : 'Note',
        text: m.text,
      })));
      if (text) sections.push(`Group chat "${t.title}":\n${text}`);
    }
  } catch { /* ignore */ }

  let out = sections.join('\n\n');
  if (out.length > 5000) out = out.slice(0, 5000) + '\n…(truncated)';
  return out;
}
