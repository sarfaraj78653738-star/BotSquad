import { addGroupMessage, getSetting, listBots, listConnections, listGroupMessages, listGroupThreads, listMcpServers, listMemory, listPlugins, listSkills } from './db';
import { buildSystemPrompt } from './prompt';
import { chatWithBot } from './providers';
import { parseSkillCallout } from './skillCallout';
import { parsePluginCallout, pluginPromptBlock } from './pluginCallout';
import { mcpPromptBlock, parseMcpCallout } from './mcpCallout';
import { parseConnectionCallout } from './connectionCallout';
import { listMcpTools } from './mcp';
import { BOT_FILE_TOOLS_PROMPT, FILE_TOOL_NAMES, executeAgentTool, parseToolCalls, stripToolBlocks } from './agent';
import { Bot, GroupMessage, newId, nowIso } from './types';

// Group chat runner: each selected bot replies IN TURN, in the order the
// bots are listed (alphabetical from listGroupMembers), using its own
// task/personality prompt and its own provider/model.
// No fake replies: a bot with no key, an invalid key, or a network error
// gets a clear system_note turn instead of an invented answer.
// There is NO summary at the end (user order 2026-10-29): the bots'
// replies are the thread, nothing extra is posted after them.
// Tool parity (user order 2026-10-29): like Main and single-bot chats,
// each bot can run MCP tools and its enabled connections in an
// approval-gated loop (approval card lives in group.tsx); skills work
// via callout. Workspace files and deploys stay Main Chat only.
export async function runGroupMessage(
  threadId: string,
  members: Bot[],
  userText: string,
  onBotWorking?: (botName: string | null) => void,
  skipUserMessage = false,
  requestApproval?: (summary: string, preview: string) => Promise<boolean>,
  signal?: AbortSignal,
): Promise<void> {
  // skipUserMessage: a Retry resends the failed text without adding a
  // second copy of the user's bubble to the thread.
  if (!skipUserMessage) {
    const userMsg: GroupMessage = { id: newId(), threadId, botId: null, role: 'user', text: userText.trim(), approvalState: null, createdAt: nowIso() };
    await addGroupMessage(userMsg);
  }

  const allBots = await listBots();
  // Others carry name + role, not just name: a bot that only knows
  // "Sales Helper" exists cannot answer who does what on the team.
  const otherNames = allBots.map((b) => (b.role ? `${b.name} — ${b.role}` : b.name));
  // Group surroundings (bug 2026-10-30): until now a group bot got no
  // group context at all, so "who is in this group, what are their
  // roles?" was truthfully answered with "I don't have that info".
  // Every group reply now carries this thread's title + member list.
  const threadTitle = (await listGroupThreads().catch(() => [])).find((x) => x.id === threadId)?.title ?? '';
  const memberList = members.map((m) => (m.role ? `${m.name} — ${m.role}` : m.name)).join('; ');
  const groupBlock = `\n\n[THIS GROUP — you are replying inside a group chat, not a 1:1 chat.${threadTitle ? ` Group title: "${threadTitle}".` : ''} Members of THIS group: ${memberList}. When the user asks who is in this group or what anyone's role is, answer from this list — never say you do not have it. Answer in your own words as your own role; never just copy the member list.]`;
  // Skill callout, same model as single chats: a skill named at the
  // start of the message applies to every bot for this turn only.
  const callout = parseSkillCallout(userText.trim(), await listSkills());
  const effectiveText = callout.skill ? callout.cleanText : userText.trim();
  // MCP callout, same model: a server named at the start applies to
  // every bot for this turn only; its tools are fetched live and
  // appended to each bot's prompt, and each bot's loop can run them
  // with mcp_call (approval card in group.tsx).
  const mcpCallout = parseMcpCallout(effectiveText, await listMcpServers());
  const mcpEffectiveText = mcpCallout.server ? mcpCallout.cleanText : effectiveText;
  let mcpBlock = '';
  if (mcpCallout.server) {
    const mcpTools = await listMcpTools(mcpCallout.server.id, mcpCallout.server.url).catch(() => []);
    mcpBlock = mcpPromptBlock(mcpCallout.server.name, mcpTools, true);
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
  // Connection callout, same model as skills/MCP: "/github ..." or
  // "GitHub, ..." grants that connection to every bot for this turn
  // only, on top of each bot's standing-enabled connections.
  const connCallout = parseConnectionCallout(mcpEffectiveText, allConns);
  const connEffectiveText = connCallout.connection ? connCallout.cleanText : mcpEffectiveText;
  // Plugin callout, same model as single chats: a plugin named at the
  // start applies to every bot for this turn only (user order
  // 2026-10-30: Main, bot, and group alike, never Main-only).
  const pluginCallout = parsePluginCallout(connEffectiveText, await listPlugins());
  const pluginBlock = pluginCallout.plugin ? pluginPromptBlock(pluginCallout.plugin) : '';
  const pluginEffectiveText = pluginCallout.plugin ? pluginCallout.cleanText : connEffectiveText;

  // Role-based auto-adopt (user order 2026-10-30): every bot replying to
  // every message was noise. Only bots whose role/task words appear in
  // the message take the turn; if none match, ONLY the first member
  // replies — a chorus of near-identical answers to one question
  // (complaint 2026-10-30) is worse than one answer. A user who wants
  // several bots names their roles in the message, and those match.
  const roleScore = (b: Bot, text: string) => {
    const lower = text.toLowerCase();
    const words = new Set(`${b.role} ${b.task}`.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3));
    let score = 0;
    for (const w of words) if (lower.includes(w)) score++;
    return score;
  };
  const scoredMembers = members.map((m) => ({ bot: m, score: roleScore(m, pluginEffectiveText) }));
  const activeMembers = scoredMembers.some((s) => s.score > 0) ? scoredMembers.filter((s) => s.score > 0).map((s) => s.bot) : (members.length ? [members[0]] : members);
  for (const bot of activeMembers) {
    // Cancel (user order 2026-10-30): a stopped turn ends here — no
    // further bot is started, and no error note is saved for the stop.
    if (signal?.aborted) break;
    onBotWorking?.(bot.name);
    try {
      const memory = await listMemory(bot.id);
      const enabledSkills = callout.skill ? [{ name: callout.skill.name, template: callout.skill.template }] : [];
      // Connectors auto-enabled (user order 2026-10-30): every bot
      // and group sees ALL verified connections, like Main Chat.
      const enabledConns = allConns.map((c) => ({ name: c.name, service: c.service }));
      const effectiveConns = connCallout.connection && !enabledConns.some((c) => c.service === connCallout.connection!.service && c.name === connCallout.connection!.name)
        ? [...enabledConns, { name: connCallout.connection.name, service: connCallout.connection.service }]
        : enabledConns;
      const system = buildSystemPrompt(bot, memory, otherNames, enabledSkills, profilePrefs, effectiveConns) + mcpBlock + groupBlock + pluginBlock;
      // Same tool loop as single-bot chats, per bot: file tools,
      // deploy, mcp_call, and service_request, each approval-gated.
      // Guards: mcp_call only for the server called out this turn;
      // service_request for any verified connection (auto-enabled
      // 2026-10-30, like Main Chat). Without an approval callback
      // (should not happen from group.tsx), gated calls are refused
      // rather than run blind.
      let botToolsPrompt = BOT_FILE_TOOLS_PROMPT + `\n\n[YOUR WORKSPACE SECTION — your files live under "groups/${threadId}/". Use plain filenames like "index.html"; they are saved into your section automatically, and listing shows only your section. You cannot see Main Chat's or other groups' files.]`;
      if (effectiveConns.length) {
        botToolsPrompt += `\n\n[TOOLS — you can also call this bot's connected services this turn with a fenced block:\n\`\`\`tool\n{"name": "service_request", "args": {"service": "<service>", "method": "GET", "path": "/..."}} \n\`\`\`\nOnly the services listed as connected for this bot. GET runs straight away; POST/PUT/PATCH/DELETE wait for the user's approval. After each result, either emit the next tool block or give your final reply with no tool block.]`;
      }
      const approve = requestApproval ?? (async () => false);
      let reply = await chatWithBot(bot, system + botToolsPrompt, history, pluginEffectiveText, signal);
      {
        const loopHistory: { role: string; text: string }[] = [];
        const actionsTaken: string[] = [];
        for (let step = 0; step < 8; step++) {
          const calls = parseToolCalls(reply).filter((c) => FILE_TOOL_NAMES.includes(c.name) || c.name === 'vercel_deploy' || c.name === 'mcp_call' || c.name === 'service_request');
          if (calls.length === 0) break;
          const results: string[] = [];
          for (const call of calls) {
            const argStr = (k: string) => typeof call.args[k] === 'string' ? call.args[k] as string : '';
            let result: string;
            if (FILE_TOOL_NAMES.includes(call.name) || call.name === 'vercel_deploy') {
              // Workspace file tools + deploy: same approval-gated
              // path as Main Chat (writes/edits/deletes/deploys pause
              // at the approval card, which group.tsx labels with the
              // replying bot's name), confined to this group's section.
              result = await executeAgentTool(call, approve, { section: `groups/${threadId}` });
              actionsTaken.push(call.name === 'vercel_deploy' ? 'vercel_deploy' : `${call.name} ${argStr('path') || argStr('query') || argStr('url')}`);
            } else if (call.name === 'mcp_call') {
              const srv = argStr('server');
              if (!mcpCallout.server || srv.toLowerCase() !== mcpCallout.server.name.toLowerCase()) {
                result = `Error: mcp_call is only allowed for the server called out this turn${mcpCallout.server ? ` ("${mcpCallout.server.name}")` : ' (none called out)'}.`;
              } else {
                result = await executeAgentTool(call, approve);
              }
              actionsTaken.push(`mcp_call ${argStr('tool')}`);
            } else {
              const svc = argStr('service');
              const allowed = effectiveConns.some((c) => c.service.toLowerCase() === svc.toLowerCase() || c.name.toLowerCase() === svc.toLowerCase());
              if (!allowed) {
                result = `Error: service "${svc}" is not enabled for this bot or called out this turn.`;
              } else {
                result = await executeAgentTool(call, approve);
              }
              actionsTaken.push(`service_request ${svc} ${argStr('path')}`);
            }
            results.push(`[Tool ${call.name} result]\n${result}`);
          }
          loopHistory.push({ role: 'assistant', text: reply });
          loopHistory.push({ role: 'user', text: results.join('\n\n') });
          if (step === 7) break;
          reply = await chatWithBot(bot, system + botToolsPrompt, [...history, ...loopHistory], 'Continue. If you need another tool, emit one tool block; otherwise give your final reply with no tool block.', signal);
        }
        reply = stripToolBlocks(reply);
        if (!reply) reply = actionsTaken.length ? `Done. Used: ${actionsTaken.join('; ')}.` : 'Done.';
      }
      // A reply is delivered content, not a draft (same as Main/Bot
      // chats): no approval gate, no "(draft)" label.
      const msg: GroupMessage = { id: newId(), threadId, botId: bot.id, role: 'assistant', text: reply, approvalState: null, createdAt: nowIso() };
      await addGroupMessage(msg);
    } catch (e) {
      // A user-cancelled turn saves nothing: no error note, and the
      // loop stops — bots that already replied keep their replies.
      if (signal?.aborted) break;
      // A failed bot reply shows the short plain-English error
      // (user order 2026-10-31) — never a bare number. The bot's
      // name is the message label.
      const note: GroupMessage = {
        id: newId(), threadId, botId: bot.id, role: 'system_note',
        text: e instanceof Error ? e.message : 'Provider error. Try again shortly.',
        approvalState: null, createdAt: nowIso(),
      };
      await addGroupMessage(note);
    }
  }
  onBotWorking?.(null);
}
