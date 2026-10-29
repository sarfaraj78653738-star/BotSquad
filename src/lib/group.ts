import { addGroupMessage, getSetting, listBotConnectionIds, listBots, listConnections, listGroupMessages, listMcpServers, listMemory, listSkills } from './db';
import { buildSystemPrompt } from './prompt';
import { chatWithBot } from './providers';
import { errorCode } from './errors';
import { parseSkillCallout } from './skillCallout';
import { mcpPromptBlock, parseMcpCallout } from './mcpCallout';
import { listMcpTools } from './mcp';
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
  // Skill callout, same model as single chats: a skill named at the
  // start of the message applies to every bot for this turn only.
  const callout = parseSkillCallout(userText.trim(), await listSkills());
  const effectiveText = callout.skill ? callout.cleanText : userText.trim();
  // MCP callout, same model: a server named at the start applies to
  // every bot for this turn only; its tools are fetched live and
  // appended to each bot's prompt. Group chats are single-reply, so
  // tools are listed for reference — running happens in Main Chat.
  const mcpCallout = parseMcpCallout(effectiveText, await listMcpServers());
  const mcpEffectiveText = mcpCallout.server ? mcpCallout.cleanText : effectiveText;
  let mcpBlock = '';
  if (mcpCallout.server) {
    const mcpTools = await listMcpTools(mcpCallout.server.id, mcpCallout.server.url).catch(() => []);
    mcpBlock = mcpPromptBlock(mcpCallout.server.name, mcpTools, false);
  }
  const prior = await listGroupMessages(threadId);
  // History for each bot: last 10 turns, assistant turns labelled by bot so
  // a bot does not mistake another bot's reply for its own.
  const botNameById = new Map(allBots.map((b) => [b.id, b.name]));
  const history = prior.slice(-10).map((m) => ({
    role: m.role,
    text: m.role === 'assistant' && m.botId ? `${botNameById.get(m.botId) ?? 'Bot'}: ${m.text}` : m.text,
  }));

  const profilePrefs = (await getSetting('profile_preferences')) ?? '';
  const allConns = await listConnections().catch(() => []);

  for (const bot of members) {
    onBotWorking?.(bot.name);
    try {
      const memory = await listMemory(bot.id);
      const enabledSkills = callout.skill ? [{ name: callout.skill.name, template: callout.skill.template }] : [];
      const connIds = await listBotConnectionIds(bot.id).catch(() => [] as string[]);
      const enabledConns = allConns.filter((c) => connIds.includes(c.id)).map((c) => ({ name: c.name, service: c.service }));
      const system = buildSystemPrompt(bot, memory, otherNames, enabledSkills, profilePrefs, enabledConns) + mcpBlock;
      const reply = await chatWithBot(bot, system, history, mcpEffectiveText);
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
