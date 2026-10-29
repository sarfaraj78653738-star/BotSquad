import { addGroupMessage, getSetting, listBotSkillIds, listBots, listGroupMessages, listMemory, listSkills } from './db';
import { buildSystemPrompt } from './prompt';
import { chatWithBot } from './providers';
import { errorCode } from './errors';
import { Bot, GroupMessage, newId, nowIso } from './types';

// Group chat runner: each selected bot replies IN TURN, in the order the
// bots are listed (alphabetical from listGroupMembers), using its own
// task/personality prompt and its own provider/model.
// No fake replies: a bot with no key, an invalid key, or a network error
// gets a clear system_note turn instead of an invented answer.
// There is NO summary at the end (user order 2026-10-29): the bots'
// replies are the thread, nothing extra is posted after them.
export async function runGroupMessage(
  threadId: string,
  members: Bot[],
  userText: string,
  onBotWorking?: (botName: string | null) => void,
  skipUserMessage = false,
): Promise<void> {
  // skipUserMessage: a Retry resends the failed text without adding a
  // second copy of the user's bubble to the thread.
  if (!skipUserMessage) {
    const userMsg: GroupMessage = { id: newId(), threadId, botId: null, role: 'user', text: userText.trim(), approvalState: null, createdAt: nowIso() };
    await addGroupMessage(userMsg);
  }

  const allBots = await listBots();
  const otherNames = allBots.map((b) => b.name);
  const prior = await listGroupMessages(threadId);
  // History for each bot: last 10 turns, assistant turns labelled by bot so
  // a bot does not mistake another bot's reply for its own.
  const botNameById = new Map(allBots.map((b) => [b.id, b.name]));
  const history = prior.slice(-10).map((m) => ({
    role: m.role,
    text: m.role === 'assistant' && m.botId ? `${botNameById.get(m.botId) ?? 'Bot'}: ${m.text}` : m.text,
  }));

  const profilePrefs = (await getSetting('profile_preferences')) ?? '';

  for (const bot of members) {
    onBotWorking?.(bot.name);
    try {
      const memory = await listMemory(bot.id);
      const enabledIds = await listBotSkillIds(bot.id);
      const enabledSkills = (await listSkills()).filter((s) => enabledIds.includes(s.id));
      const system = buildSystemPrompt(bot, memory, otherNames, enabledSkills, profilePrefs);
      const reply = await chatWithBot(bot, system, history, userText.trim());
      // A reply is delivered content, not a draft (same as Main/Bot
      // chats): no approval gate, no "(draft)" label.
      const msg: GroupMessage = { id: newId(), threadId, botId: bot.id, role: 'assistant', text: reply, approvalState: null, createdAt: nowIso() };
      await addGroupMessage(msg);
    } catch (e) {
      // A failed bot reply shows ONLY a number — never a sentence,
      // never raw provider text. The bot's name is the message label.
      const note: GroupMessage = {
        id: newId(), threadId, botId: bot.id, role: 'system_note',
        text: `Error ${errorCode(e)}`,
        approvalState: null, createdAt: nowIso(),
      };
      await addGroupMessage(note);
    }
  }
  onBotWorking?.(null);
}
