import { useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AdSlot, Button, LoadingRow } from './ui';
import { ComposerBar } from './ComposerBar';
import { AlertDialog, type AlertDialogButton } from './AlertDialog';
import LiveBrowserPanel, { LiveBrowserHandle } from './LiveBrowserPanel';
import { parseBrowserCommands, parseBrowserRequest } from '../lib/liveBrowser';
import { addMemory, addMessage, deleteChat, deleteUniversalThread, getBot, getOrCreateChat, getPinnedThreads, getSetting, getUniversalTitle, listBots, listConnections, listMcpServers, listMemory, listMessages, listPlugins, listSkills, renameChat, saveBot, saveSkill, setUniversalTitle, togglePinThread } from '../lib/db';
import { getUniversal, getUniversalChatId, setUniversalChatId } from '../lib/universal';
import { detectAutoSkill } from '../lib/autoSkill';
import { buildSystemPrompt, extractMemoryNote } from '../lib/prompt';
import { saveArtifactFromReply } from '../lib/projects';
import { buildTranscript, exportChatZip } from '../lib/chatExport';
import { linkChatToProject } from '../lib/projects';
import { addChatToHome, shortcutUri } from '../lib/shortcut';
import { AGENT_TOOLS_PROMPT, BOT_FILE_TOOLS_PROMPT, FILE_TOOL_NAMES, executeAgentTool, parseToolCalls, stripToolBlocks } from '../lib/agent';
import { connectedServicesPrompt } from '../lib/serviceTools';
import { buildCrossChatDigest } from '../lib/crossChat';
import { parseSkillCallout } from '../lib/skillCallout';
import { parsePluginCallout, pluginPromptBlock } from '../lib/pluginCallout';
import { mcpPromptBlock, parseMcpCallout } from '../lib/mcpCallout';
import { parseConnectionCallout } from '../lib/connectionCallout';
import { listMcpTools } from '../lib/mcp';
import { ThreadMenu } from './ThreadMenu';
import { chatWithBot } from '../lib/providers';
import { errorCode, isRawErrorText } from '../lib/errors';
import { Bot, Message, newId, nowIso } from '../lib/types';
import { useLanguage, useTokens } from '../lib/tokens';
import { t, translateApproval } from '../lib/i18n';

// Shared chat surface used by Main Chat, a single bot's chat screen,
// and (in universal mode) the bot-free Main Chat. All message,
// draft-approval, voice, browse and memory logic is the original chat
// logic, unchanged; only the presentation is new.
// `topBar` renders the screen's own header (menu + title on Main
// Chat, back button + name on a bot chat) so no route name ever leaks.
function makeUniversalBot(): Bot {
  return {
    id: 'universal',
    name: 'Main Chat',
    role: 'Main Chat',
    avatarColor: '#E7DCC8',
    avatarIcon: 'M',
    task: 'Help the user with whatever they ask',
    personality: 'Direct and specific',
    instructions: '',
    boundaries: 'Never send, publish, buy, or delete anything externally. Drafts need user approval.',
    provider: 'openai-compatible',
    // Placeholder only: universal mode sends the stored universal
    // config (see providers.ts), never this field. It is empty so the
    // app never presents a model of its own (user order 2026-10-29).
    model: '',
    endpoint: undefined,
    isPinned: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function ChatView({ botId, universal, universalChatId, topBar }: { botId?: string; universal?: boolean; universalChatId?: string; topBar: (bot: Bot | null, actions?: React.ReactNode) => React.ReactNode }) {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [bot, setBot] = useState<Bot | null>(() => (universal ? makeUniversalBot() : null));
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // A failed reply shows ONLY a number ("Error 503") plus Retry — never
  // a sentence, never raw provider text, never a numeric prefix.
  const [failedCode, setFailedCode] = useState<number | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  // Agent approval card: a file write/edit/delete pauses the agent
  // loop here until the user taps Approve or Reject for that exact
  // change. Nothing is written without that tap.
  const [pendingApproval, setPendingApproval] = useState<{ summary: string; preview: string; resolve: (ok: boolean) => void } | null>(null);

  function requestApproval(summary: string, preview: string): Promise<boolean> {
    const translated = translateApproval(language, summary, preview);
    return new Promise((resolve) => {
      pendingApprovalRef.current = resolve;
      setPendingApproval({ summary: translated.summary, preview: translated.preview, resolve });
    });
  }
  const [adsRemoved, setAdsRemoved] = useState(false);
  // Cancel (user order 2026-10-30): while a reply is loading, the
  // composer's send button becomes a stop button. Aborting the
  // controller rejects the in-flight provider fetch at once; a wait
  // on an approval card is released with "reject" so the loop can
  // exit instead of hanging on the card. A cancelled turn shows no
  // error banner and no retry — the user's message stays, no reply
  // is saved.
  const abortRef = useRef<AbortController | null>(null);
  const pendingApprovalRef = useRef<((ok: boolean) => void) | null>(null);
  function cancelSend() {
    pendingApprovalRef.current?.(false);
    pendingApprovalRef.current = null;
    setPendingApproval(null);
    abortRef.current?.abort();
  }
  // Themed dialogs (bug 2026-10-30): Alert.alert renders the system
  // dialog, which ignores the app's dark mode and showed up white.
  const [dialog, setDialog] = useState<{ title: string; message?: string; buttons: AlertDialogButton[] } | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const voiceBase = useRef('');
  // Live in-chat browser: opened by user intent ("open Facebook") or
  // by a [BROWSER ...] command in an assistant reply. The panel owns
  // its WebView; this screen only feeds it requests.
  const browserRef = useRef<LiveBrowserHandle>(null);
  const [browserExpanded, setBrowserExpanded] = useState(false);
  // Auto-scroll: the list NEVER scrolled on its own, so when the
  // keyboard opened (or a reply arrived) the latest message sat hidden
  // behind the composer (bug 2026-10-30). The list now sticks to the
  // bottom: new content scrolls into view, and opening the keyboard
  // jumps to the latest message. If the user scrolled up to read old
  // messages, stick turns off so a reply never yanks them; scrolling
  // back near the bottom turns it on again.
  const listRef = useRef<FlatList<Message> | null>(null);
  const stickToBottom = useRef(true);
  const scrolledOnce = useRef(false);
  const scrollPending = useRef(false);
  const scrollToBottom = (animated: boolean) => listRef.current?.scrollToEnd({ animated });

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollToBottom(true));
    return () => sub.remove();
  }, []);

  // New-message scroll (bug 2026-10-30, round 2): the stick-to-bottom
  // flag alone was not enough — when the keyboard resizes the list,
  // the list ends up sitting above the bottom and no scroll event
  // re-sticks it, so an arriving AI reply never scrolled into view
  // even though the user's own typed text did (keyboard-open scroll).
  // A growing message count now always scrolls, in every chat.
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      // Round 3 (bug 2026-10-30): scrolling at once was not enough —
      // it ran before the new rows were laid out, landed short, and
      // the short landing flipped stickToBottom off, so the layout
      // correction never ran and the reply's last lines stayed hidden
      // below the composer. So the growth also arms a pending scroll
      // (the next content-size change scrolls regardless of stick)
      // and a deferred scroll after layout settles.
      scrollPending.current = true;
      scrollToBottom(scrolledOnce.current);
      setTimeout(() => scrollToBottom(false), 150);
      scrolledOnce.current = true;
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    (async () => {
      setFailedCode(null);
      setFailedText(null);
      setAdsRemoved((await getSetting('premium_ads_removed')) === '1');
      if (universal) {
        // Universal chat needs no bot and no chats-table row. The open
        // thread is the stored current id (or the thread History asked
        // for, which then becomes current); addMessage's chats-table
        // updated_at update simply affects 0 rows, which is fine.
        // The header shows the thread's renamed title when one exists.
        const universalBot = makeUniversalBot();
        const savedTitle = await getUniversalTitle(universalChatId ?? (await getUniversalChatId())).catch(() => null);
        if (savedTitle?.trim()) universalBot.name = savedTitle.trim();
        setBot(universalBot);
        const id = universalChatId ?? (await getUniversalChatId());
        if (universalChatId) await setUniversalChatId(universalChatId);
        setChatId(id);
        setMessages(await listMessages(id));
        return;
      }
      if (!botId) return;
      const b = await getBot(botId);
      setBot(b);
      if (b) {
        const chat = await getOrCreateChat(b.id);
        setChatId(chat.id);
        setMessages(await listMessages(chat.id));
      }
    })().catch(() => {});
  }, [botId, universal, universalChatId]);

  // New chat (Main Chat only): the current thread is NOT deleted — it
  // stays in History and can be reopened. A fresh thread starts empty,
  // which is also what resets the context window: without it, the
  // oldest messages would just keep being dropped silently once the
  // window fills (see capHistory). Tapping on an empty thread does
  // nothing, so empty threads never pile up in History.
  async function newChat() {
    if (!universal || messages.length === 0) return;
    const id = `universal-${newId()}`;
    await setUniversalChatId(id);
    setChatId(id);
    setMessages([]);
    setFailedCode(null);
    setFailedText(null);
  }

  // Header thread menu (three-dot): Share, Rename, Pin/Unpin, Add to
  // project, Add to home, Export ZIP, Delete. It only exists for a
  // thread that already has messages — a fresh empty chat shows no
  // header actions at all (user rule 2026-10-29). For a bot chat,
  // Rename renames the bot itself, since the bot's name is the name
  // the user sees for that chat.
  const threadTitle = bot?.name ?? 'Main Chat';
  const threadTranscript = () => buildTranscript(threadTitle, messages.map((m) => ({ role: m.role, text: m.text })));

  async function openMenu() {
    setMenuPinned((await getPinnedThreads().catch(() => [] as string[])).includes(chatId));
    setMenuOpen(true);
  }

  async function handleRename(name: string) {
    if (universal) {
      await setUniversalTitle(chatId, name);
      setBot((b) => (b ? { ...b, name } : b));
    } else if (bot) {
      const updated = { ...bot, name, updatedAt: new Date().toISOString() };
      await saveBot(updated);
      setBot(updated);
    } else {
      await renameChat(chatId, name);
    }
  }

  async function handleTogglePin() {
    const pinned = await togglePinThread(chatId);
    setMenuPinned(pinned);
  }

  async function handleAddToProject(projectId: string) {
    // Bot chats open by bot id, so the link stores the bot id for
    // bot chats (the chats-table id would open nothing).
    const linkId = universal ? chatId : (bot?.id ?? chatId);
    await linkChatToProject(projectId, universal ? 'main' : 'bot', linkId, threadTitle);
  }

  async function handleAddToHome() {
    const kind = universal ? 'main' : 'bot';
    const shortcutId = universal ? chatId : (bot?.id ?? chatId);
    return addChatToHome(threadTitle, shortcutUri(kind, shortcutId));
  }

  async function handleExportZip() {
    try {
      await exportChatZip(threadTitle, messages.map((m) => ({ role: m.role, text: m.text })));
    } catch {
      setDialog({ title: t(language, 'exportFailed'), message: t(language, 'zipFailed'), buttons: [{ text: 'OK' }] });
    }
  }

  async function handleDeleteThread() {
    if (universal) {
      await deleteUniversalThread(chatId);
      const current = await getUniversalChatId().catch(() => '');
      if (current === chatId) await setUniversalChatId('universal-chat');
      router.replace('/');
    } else {
      await deleteChat(chatId);
      router.replace('/bots');
    }
  }

  function headerIconButton(icon: React.ComponentProps<typeof Feather>['name'], label: string, onPress: () => void) {
    return (
      <Pressable accessibilityLabel={label} accessibilityRole="button" onPress={onPress} style={styles.headerIconButton}>
        <Feather name={icon} size={20} color={tokens.text} />
      </Pressable>
    );
  }

  // Header actions, gated on the thread having messages: a fresh empty
  // chat shows none of them. Main Chat gets Export + New chat + menu;
  // a bot chat gets Export + menu (its screen already owns "+ New",
  // which creates a new bot, not a new chat).
  const hasMessages = messages.length > 0;
  const headerActions = hasMessages ? (
    <View style={styles.headerActions}>
      {headerIconButton('file-text', 'Export chat as ZIP', () => { void handleExportZip(); })}
      {universal ? headerIconButton('plus', 'Start a new chat', () => { void newChat(); }) : null}
      {headerIconButton('more-vertical', 'Chat menu', () => { void openMenu(); })}
    </View>
  ) : undefined;
  async function send(text: string, reuseUser = false) {
    if (!bot || !chatId || !text.trim()) return;
    setNotice('');
    // No model of the app's own exists anymore: if Main Chat has no
    // saved model, say so plainly instead of sending with a blank
    // model name and showing a cryptic provider error.
    if (universal && !(await getUniversal()).model.trim()) {
      setNotice(t(language, 'noModelNotice'));
      return;
    }
    // Browser intent in the user's own words opens the in-chat panel
    // at once; the model reply may then drive it with [BROWSER ...]
    // commands (read-only actions run, tap/type wait for approval).
    const browserRequest = parseBrowserRequest(text.trim());
    if (browserRequest.open) browserRef.current?.open(browserRequest.url);
    setFailedCode(null);
    setFailedText(null);
    setLoading(true);
    abortRef.current = new AbortController();
    const signal = abortRef.current.signal;
    let next = messages;
    if (!reuseUser) {
      const userMsg: Message = { id: newId(), chatId, botId: bot.id, role: 'user', text: text.trim(), approvalState: null, createdAt: nowIso() };
      await addMessage(userMsg);
      next = [...messages, userMsg];
      setMessages(next);
    }
    try {
      const memory = await listMemory(bot.id);
      const others = (await listBots()).map((b) => (b.role ? `${b.name} — ${b.role}` : b.name));
      // Skills are called out, not pre-enabled (user order 2026-10-29):
      // "/skill-name ..." or "Skill Name, ..." at the start of the
      // message applies that saved skill for this turn only.
      const callout = parseSkillCallout(text.trim(), await listSkills());
      const enabledSkills = callout.skill ? [{ name: callout.skill.name, template: callout.skill.template }] : [];
      const effectiveText = callout.skill ? callout.cleanText : text.trim();
      // MCP callout, same model as skills: a server named at the start
      // of the message applies to this turn only, in every chat. Its
      // tools are fetched live and appended to the prompt; in Main,
      // bot, and group chats the agent loop can then run one with
      // mcp_call (each surface has its own approval card).
      const mcpCallout = parseMcpCallout(effectiveText, await listMcpServers());
      const mcpEffectiveText = mcpCallout.server ? mcpCallout.cleanText : effectiveText;
      let mcpBlock = '';
      if (mcpCallout.server) {
        const mcpTools = await listMcpTools(mcpCallout.server.id, mcpCallout.server.url).catch(() => []);
        mcpBlock = mcpPromptBlock(mcpCallout.server.name, mcpTools, true);
      }
      // Connection callout, same model as skills/MCP: "/github ..."
      // or "GitHub, ..." grants that connection for this turn only.
      // Connectors are auto-enabled (user order 2026-10-30): bot
      // chats see ALL verified connections, like Main Chat — the old
      // per-bot toggles no longer gate anything.
      const connCallout = parseConnectionCallout(mcpEffectiveText, await listConnections());
      const connEffectiveText = connCallout.connection ? connCallout.cleanText : mcpEffectiveText;
      const profilePrefs = (await getSetting('profile_preferences')) ?? '';
      const enabledConns = universal
        ? []
        : (await listConnections()).map((c) => ({ name: c.name, service: c.service }));
      const effectiveConns = connCallout.connection && !enabledConns.some((c) => c.service === connCallout.connection!.service && c.name === connCallout.connection!.name)
        ? [...enabledConns, { name: connCallout.connection.name, service: connCallout.connection.service }]
        : enabledConns;
      // Plugin callout, same model as skills: a plugin named at the
      // start of the message applies to this turn only, in Main, bot,
      // and group chats alike (user order 2026-10-30: never
      // Main-only). The model gets the plugin's manifest as guidance;
      // its code never runs on the phone.
      const pluginCallout = parsePluginCallout(connEffectiveText, await listPlugins());
      const pluginBlock = pluginCallout.plugin ? pluginPromptBlock(pluginCallout.plugin) : '';
      const pluginEffectiveText = pluginCallout.plugin ? pluginCallout.cleanText : connEffectiveText;
      const system = buildSystemPrompt(bot, memory, others, enabledSkills, profilePrefs, effectiveConns) + mcpBlock + pluginBlock;
      const history = next.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      // Main Chat is an agent, not just a chatbot: it knows the other
      // threads' recent context, and it can work with workspace files
      // and public web pages in a multi-step loop. A plain question
      // still gets a plain reply — the loop only engages when the
      // model emits a tool block for a real task. Bot chats run the
      // same kind of loop (user order 2026-10-29, extended 2026-10-30:
      // MCP, connectors, skills, plugins, files, and deploy in every
      // chat, not just Main Chat).
      let finalReply: string;
      if (universal) {
        let systemFull = system;
        const digest = await buildCrossChatDigest(chatId).catch(() => '');
        if (digest) systemFull += `\n\n[OTHER CHATS CONTEXT — recent messages from this phone's other threads, so questions about them can be answered. Never reveal a thread's contents unless the user asks about that thread.]\n${digest}`;
        systemFull += AGENT_TOOLS_PROMPT;
        const svcPrompt = await connectedServicesPrompt().catch(() => '');
        if (svcPrompt) systemFull += svcPrompt;
        let reply = await chatWithBot(bot, systemFull, history, pluginEffectiveText, signal);
        const loopHistory: { role: string; text: string }[] = [];
        const actionsTaken: string[] = [];
        for (let step = 0; step < 8; step++) {
          const calls = parseToolCalls(reply);
          if (calls.length === 0) break;
          const results: string[] = [];
          for (const call of calls) {
            const result = await executeAgentTool(call, requestApproval);
            results.push(`[Tool ${call.name} result]\n${result}`);
            const target = typeof call.args.path === 'string' ? call.args.path : typeof call.args.query === 'string' ? call.args.query : typeof call.args.url === 'string' ? call.args.url : '';
            actionsTaken.push(target ? `${call.name} ${target}` : call.name);
          }
          loopHistory.push({ role: 'assistant', text: reply });
          loopHistory.push({ role: 'user', text: results.join('\n\n') });
          if (step === 7) break;
          reply = await chatWithBot(bot, systemFull, [...history, ...loopHistory], 'Continue with the task. If you need another tool, emit one tool block; otherwise give your final reply with no tool block.', signal);
        }
        finalReply = stripToolBlocks(reply);
        if (!finalReply) finalReply = actionsTaken.length ? `Done. Changes: ${actionsTaken.join('; ')}. Open Workspace to preview or export.` : 'Done.';
        // Bot browser commands in the final reply drive the panel. Tap/type
        // actions stop at the panel's approval card; they never run
        // without the user approving that exact action.
        for (const action of parseBrowserCommands(finalReply)) browserRef.current?.requestAction(action);
      } else {
        // Bot chats are agents too (user order 2026-10-29, extended
        // 2026-10-30): a bot can run MCP tools, its enabled
        // connections, AND workspace file tools, not just Main Chat.
        // Skills already work here via callout. The loop runs file
        // tools, deploy, mcp_call, and service_request, each
        // approval-gated; any other tool block is stripped, never
        // executed. Guards: mcp_call
        // only for the server called out this turn; service_request
        // only for a service enabled for this bot or called out this
        // turn — anything else returns an error result and never
        // executes.
        let botToolsPrompt = BOT_FILE_TOOLS_PROMPT + `\n\n[YOUR WORKSPACE SECTION — your files live under "bots/${bot.id}/". Use plain filenames like "index.html"; they are saved into your section automatically, and listing shows only your section. You cannot see Main Chat's or other bots' files.]`;
        if (effectiveConns.length) {
          botToolsPrompt += `\n\n[TOOLS — you can also call this bot's connected services this turn with a fenced block:\n\`\`\`tool\n{"name": "service_request", "args": {"service": "<service>", "method": "GET", "path": "/..."}} \n\`\`\`\nOnly the services listed as connected for this bot. GET runs straight away; POST/PUT/PATCH/DELETE wait for the user's approval. After each result, either emit the next tool block or give your final reply with no tool block.]`;
        }
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
                // path as Main Chat, confined to this bot's section.
                result = await executeAgentTool(call, requestApproval, { section: `bots/${bot.id}` });
                actionsTaken.push(call.name === 'vercel_deploy' ? 'vercel_deploy' : `${call.name} ${argStr('path') || argStr('query') || argStr('url')}`);
              } else if (call.name === 'mcp_call') {
                const srv = argStr('server');
                if (!mcpCallout.server || srv.toLowerCase() !== mcpCallout.server.name.toLowerCase()) {
                  result = `Error: mcp_call is only allowed for the server called out this turn${mcpCallout.server ? ` ("${mcpCallout.server.name}")` : ' (none called out)'}.`;
                } else {
                  result = await executeAgentTool(call, requestApproval);
                }
                actionsTaken.push(`mcp_call ${argStr('tool')}`);
              } else {
                const svc = argStr('service');
                const allowed = effectiveConns.some((c) => c.service.toLowerCase() === svc.toLowerCase() || c.name.toLowerCase() === svc.toLowerCase());
                if (!allowed) {
                  result = `Error: service "${svc}" is not enabled for this bot or called out this turn.`;
                } else {
                  result = await executeAgentTool(call, requestApproval);
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
          finalReply = stripToolBlocks(reply);
          if (!finalReply) finalReply = actionsTaken.length ? `Done. Used: ${actionsTaken.join('; ')}.` : 'Done.';
        }
        // Bot browser commands in the final reply drive the panel. Tap/type
        // actions stop at the panel's approval card; they never run
        // without the user approving that exact action.
        for (const action of parseBrowserCommands(finalReply)) browserRef.current?.requestAction(action);
      }
      // A reply is delivered content, not a draft: no approval gate.
      // (Earlier builds saved every reply as approvalState 'draft' and
      // showed Approve/Reject under it; that gate did nothing, since
      // the app never sends anything externally, and it only made
      // replies look broken. Replies are final on arrival; "Save as
      // artifact" is the explicit save action.)
      const assistantMsg: Message = { id: newId(), chatId, botId: bot.id, role: 'assistant', text: finalReply, approvalState: null, createdAt: nowIso() };
      await addMessage(assistantMsg);
      setMessages([...next, assistantMsg]);
      // A delivered reply clears any earlier failure banner at once.
      setFailedCode(null);
      setFailedText(null);
      // Post-save notes (memory, auto-skill) are best-effort and live
      // in their own try/catch: a throw here used to land in the outer
      // catch and surface as "Error 503" on top of a reply that had
      // already arrived (bug 2026-10-30). The reply stands regardless.
      try {
        const note = extractMemoryNote(text, finalReply);
        if (note) await addMemory(bot.id, note, 'auto_learned');
        // Automatic skill saving, no approval prompt, no popup: a
        // pattern-based on-device detector (see lib/autoSkill.ts) saves
        // a clear standing instruction, correction, or preference as a
        // skill in the local skills store. It is NOT enabled for any bot
        // until the user reviews and enables it on the Skills page, and
        // an identical instruction is never saved twice.
        const auto = detectAutoSkill(text.trim(), finalReply);
        if (auto) {
          const existing = await listSkills();
          const snippet = auto.instruction.slice(0, 60);
          if (!existing.some((s) => s.template.includes(snippet))) {
            await saveSkill({ id: newId(), botId: universal ? null : bot.id, name: auto.name, template: `Auto-saved from a chat with ${bot.name}. Review before enabling — this is a note only; it never overrides hard boundaries, never sends anything externally, and never executes code.\n\n${auto.instruction}`, source: 'local', repoUrl: null, permissions: '', createdAt: nowIso() });
          }
        }
      } catch { /* notes are best-effort; the reply already arrived */ }
    } catch (e) {
      // A cancelled turn is not a failure: no error banner, no retry.
      if (!signal.aborted && (e as { name?: string } | null)?.name !== 'AbortError') {
        setFailedCode(errorCode(e));
        setFailedText(text.trim());
      }
    } finally {
      abortRef.current = null;
      setLoading(false);
    }
  }

  // No per-message "Save as skill" option exists anywhere in chat:
  // skills are saved automatically (see send() above) and managed on
  // the Skills page. Bot browsing lives only in the in-chat browser panel.

  function handleAttachment(att: { name: string; size: number | null; kind: 'photo' | 'document' }) {
    const size = att.size === null ? 'unknown size' : att.size < 1024 ? `${att.size} B` : att.size < 1024 * 1024 ? `${(att.size / 1024).toFixed(1)} KB` : `${(att.size / (1024 * 1024)).toFixed(1)} MB`;
    // Note only: the file itself is not uploaded or read, and no file
    // contents are faked. The name travels inside the message text, so
    // it shows in the chat bubble.
    void send(`[Attachment: ${att.name} (${size})] — the file itself was not uploaded or read; treat this only as a note that the user attached it.`);
  }

  if (!bot) return <View style={styles.wrap}><Text style={styles.sub}>{t(language, 'loadingBot')}</Text></View>;

  return (
    <View style={styles.wrap}>
      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        buttons={dialog?.buttons ?? []}
        onDismiss={() => setDialog(null)}
      />
      {topBar(bot, headerActions)}
      <AdSlot visible={!adsRemoved && loading} />
      {browserExpanded ? null : <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        scrollEventThrottle={16}
        onScroll={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          stickToBottom.current = contentSize.height - (layoutMeasurement.height + contentOffset.y) < 120;
        }}
        onContentSizeChange={() => {
          if (stickToBottom.current || scrollPending.current) scrollToBottom(scrolledOnce.current);
          scrollPending.current = false;
          scrolledOnce.current = true;
        }}
        renderItem={({ item }) => {
          if (item.role === 'user') {
            return (
              <View style={styles.userRow}>
                <View style={styles.userBubble}><Text style={styles.userText}>{item.text}</Text></View>
              </View>
            );
          }
          // A legacy raw error saved in history renders as a number
          // only, exactly like a fresh failure — history is not deleted.
          if (isRawErrorText(item.text)) {
            return (
              <View style={styles.assistantRow}>
                <Text style={styles.botLabel}>{bot.name}</Text>
                <Text style={styles.failedText}>Error 503</Text>
              </View>
            );
          }
          if (item.role === 'system_note') {
            return (
              <View style={styles.noteRow}><Text style={styles.noteText}>{item.text}</Text></View>
            );
          }
          return (
            <View style={styles.assistantRow}>
              <Text style={styles.botLabel}>{bot.name}</Text>
              <Text style={styles.assistantText}>{item.text}</Text>
              <View style={styles.msgActions}>
                <Pressable
                  accessibilityLabel="Save as artifact"
                  onPress={async () => { await saveArtifactFromReply(item.text); setDialog({ title: t(language, 'saved'), message: t(language, 'savedToArtifacts'), buttons: [{ text: 'OK' }] }); }}
                >
                  <Text style={styles.saveArtifact}>{t(language, 'saveAsArtifact')}</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />}
      {loading && <LoadingRow label={universal ? t(language, 'working') : t(language, 'botWorking')} />}
      {voiceNote ? <Text style={styles.voiceNote}>{voiceNote}</Text> : null}

      {failedCode !== null && failedText ? (
        <View style={styles.failedRow}>
          <Text style={styles.failedText}>Error {failedCode}</Text>
          <Pressable
            accessibilityLabel="Retry"
            onPress={() => { const t = failedText; setFailedCode(null); setFailedText(null); void send(t, true); }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>{t(language, 'retry')}</Text>
          </Pressable>
        </View>
      ) : null}

      <LiveBrowserPanel ref={browserRef} botName={bot.name} onExpandedChange={setBrowserExpanded} />
      {notice ? <Text style={styles.voiceNote}>{notice}</Text> : null}
      <ThreadMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        target={{ kind: universal ? 'main' : 'bot', id: chatId, title: threadTitle, transcript: threadTranscript() }}
        pinned={menuPinned}
        onRename={handleRename}
        onTogglePin={handleTogglePin}
        onAddToProject={handleAddToProject}
        onAddToHome={handleAddToHome}
        onExportZip={handleExportZip}
        onDelete={handleDeleteThread}
      />
      {pendingApproval ? (
        <View style={styles.approvalCard}>
          <Text style={styles.approvalTitle}>{t(language, 'approvalFile')}</Text>
          <Text style={styles.approvalSummary}>{pendingApproval.summary}</Text>
          <Text style={styles.approvalPreview} numberOfLines={8}>{pendingApproval.preview}</Text>
          <View style={styles.approvalRow}>
            <Button title={t(language, 'approve')} onPress={() => { pendingApprovalRef.current = null; pendingApproval.resolve(true); setPendingApproval(null); }} />
            <Button title={t(language, 'reject')} variant="secondary" onPress={() => { pendingApprovalRef.current = null; pendingApproval.resolve(false); setPendingApproval(null); }} />
          </View>
        </View>
      ) : null}
      <View style={styles.composerWrap}>
        <ComposerBar
          input={input}
          onChangeText={setInput}
          placeholder={universal ? t(language, 'messagePlaceholder') : t(language, 'messageBotPlaceholder')}
          loading={loading}
          onSend={() => { const t = input; setInput(''); voiceBase.current = ''; void send(t); }}
          onCancel={cancelSend}
          onAttachment={handleAttachment}
          onVoicePartial={(t) => { if (!voiceBase.current) voiceBase.current = input; setInput(voiceBase.current ? `${voiceBase.current} ${t}` : t); }}
          onVoiceFinal={(t) => { setInput(voiceBase.current ? `${voiceBase.current} ${t}`.trim() : t); voiceBase.current = ''; setVoiceNote(''); }}
          onVoiceError={(m) => { voiceBase.current = ''; setVoiceNote(m); }}
        />
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  assistantRow: { marginBottom: 20 },
  assistantText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  botLabel: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 4 },
  saveArtifact: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700' },
  approvalCard: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginHorizontal: tokens.space.md, marginBottom: 8, padding: tokens.space.md },
  approvalPreview: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 6 },
  approvalRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approvalSummary: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600', marginTop: 4 },
  approvalTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800' },
  composerWrap: { paddingBottom: 12, paddingHorizontal: tokens.space.md, paddingTop: 4 },
  headerActions: { alignItems: 'center', flexDirection: 'row', gap: 2 },
  headerIconButton: { alignItems: 'center', backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 17, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  failedRow: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  failedText: { color: tokens.danger, fontSize: tokens.font.md, fontWeight: '700' },
  list: { flex: 1 },
  listContent: { padding: tokens.space.md },
  msgActions: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: 8 },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 8 },
  noteRow: { alignItems: 'center', marginBottom: 16 },
  noteText: { color: tokens.textMuted, fontSize: tokens.font.sm, textAlign: 'center' },
  retryButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md },
  userBubble: { backgroundColor: tokens.accent, borderRadius: tokens.radius.lg, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userText: { color: tokens.onAccent, fontSize: tokens.font.md, lineHeight: 24 },
  voiceNote: { color: tokens.textMuted, fontSize: tokens.font.sm, paddingHorizontal: tokens.space.md, paddingBottom: 4 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
