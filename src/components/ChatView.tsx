import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AdSlot, LoadingRow } from './ui';
import { ComposerBar } from './ComposerBar';
import LiveBrowserPanel, { LiveBrowserHandle } from './LiveBrowserPanel';
import { parseBrowserCommands, parseBrowserRequest } from '../lib/liveBrowser';
import { addMemory, addMessage, deleteChat, deleteUniversalThread, getBot, getOrCreateChat, getPinnedThreads, getSetting, getUniversalTitle, listBotSkillIds, listBots, listMemory, listMessages, listSkills, renameChat, saveBot, saveSkill, setUniversalTitle, togglePinThread } from '../lib/db';
import { getUniversal, getUniversalChatId, setUniversalChatId } from '../lib/universal';
import { detectAutoSkill } from '../lib/autoSkill';
import { buildSystemPrompt, extractMemoryNote } from '../lib/prompt';
import { saveArtifactFromReply } from '../lib/projects';
import { buildTranscript, exportChatZip } from '../lib/chatExport';
import { linkChatToProject } from '../lib/projects';
import { addChatToHome, shortcutUri } from '../lib/shortcut';
import { ThreadMenu } from './ThreadMenu';
import { chatWithBot } from '../lib/providers';
import { errorCode, isRawErrorText } from '../lib/errors';
import { Bot, Message, newId, nowIso } from '../lib/types';
import { useTokens } from '../lib/tokens';

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
  const [adsRemoved, setAdsRemoved] = useState(false);
  const [voiceNote, setVoiceNote] = useState('');
  const voiceBase = useRef('');
  // Live in-chat browser: opened by user intent ("open Facebook") or
  // by a [BROWSER ...] command in an assistant reply. The panel owns
  // its WebView; this screen only feeds it requests.
  const browserRef = useRef<LiveBrowserHandle>(null);
  const [browserExpanded, setBrowserExpanded] = useState(false);

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
      Alert.alert('Export failed', 'The ZIP could not be created. Try again.');
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
      setNotice('No model is set yet. Save your model in Settings, then chat here.');
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
    let next = messages;
    if (!reuseUser) {
      const userMsg: Message = { id: newId(), chatId, botId: bot.id, role: 'user', text: text.trim(), approvalState: null, createdAt: nowIso() };
      await addMessage(userMsg);
      next = [...messages, userMsg];
      setMessages(next);
    }
    try {
      const memory = await listMemory(bot.id);
      const others = (await listBots()).map((b) => b.name);
      const enabledIds = await listBotSkillIds(bot.id);
      const enabledSkills = (await listSkills()).filter((s) => enabledIds.includes(s.id));
      const profilePrefs = (await getSetting('profile_preferences')) ?? '';
      const system = buildSystemPrompt(bot, memory, others, enabledSkills, profilePrefs);
      const history = next.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const reply = await chatWithBot(bot, system, history, text.trim());
      // Bot browser commands in the reply drive the panel. Tap/type
      // actions stop at the panel's approval card; they never run
      // without the user approving that exact action.
      for (const action of parseBrowserCommands(reply)) browserRef.current?.requestAction(action);
      // A reply is delivered content, not a draft: no approval gate.
      // (Earlier builds saved every reply as approvalState 'draft' and
      // showed Approve/Reject under it; that gate did nothing, since
      // the app never sends anything externally, and it only made
      // replies look broken. Replies are final on arrival; "Save as
      // artifact" is the explicit save action.)
      const assistantMsg: Message = { id: newId(), chatId, botId: bot.id, role: 'assistant', text: reply, approvalState: null, createdAt: nowIso() };
      await addMessage(assistantMsg);
      setMessages([...next, assistantMsg]);
      const note = extractMemoryNote(text, reply);
      if (note) await addMemory(bot.id, note, 'auto_learned');
      // Automatic skill saving, no approval prompt, no popup: a
      // pattern-based on-device detector (see lib/autoSkill.ts) saves
      // a clear standing instruction, correction, or preference as a
      // skill in the local skills store. It is NOT enabled for any bot
      // until the user reviews and enables it on the Skills page, and
      // an identical instruction is never saved twice.
      const auto = detectAutoSkill(text.trim(), reply);
      if (auto) {
        const existing = await listSkills();
        const snippet = auto.instruction.slice(0, 60);
        if (!existing.some((s) => s.template.includes(snippet))) {
          await saveSkill({ id: newId(), botId: universal ? null : bot.id, name: auto.name, template: `Auto-saved from a chat with ${bot.name}. Review before enabling — this is a note only; it never overrides hard boundaries, never sends anything externally, and never executes code.\n\n${auto.instruction}`, source: 'local', repoUrl: null, permissions: '', createdAt: nowIso() });
        }
      }
    } catch (e) {
      setFailedCode(errorCode(e));
      setFailedText(text.trim());
    } finally {
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

  if (!bot) return <View style={styles.wrap}><Text style={styles.sub}>Loading bot…</Text></View>;

  return (
    <View style={styles.wrap}>
      {topBar(bot, headerActions)}
      <AdSlot visible={!adsRemoved && loading} />
      {browserExpanded ? null : <FlatList
        data={messages}
        keyExtractor={(m) => m.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
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
                  onPress={async () => { await saveArtifactFromReply(item.text); Alert.alert('Saved', 'Saved to Artifacts.'); }}
                >
                  <Text style={styles.saveArtifact}>Save as artifact</Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />}
      {loading && <LoadingRow label="Bot is working…" />}
      {voiceNote ? <Text style={styles.voiceNote}>{voiceNote}</Text> : null}

      {failedCode !== null && failedText ? (
        <View style={styles.failedRow}>
          <Text style={styles.failedText}>Error {failedCode}</Text>
          <Pressable
            accessibilityLabel="Retry"
            onPress={() => { const t = failedText; setFailedCode(null); setFailedText(null); void send(t, true); }}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>Retry</Text>
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
      <View style={styles.composerWrap}>
        <ComposerBar
          input={input}
          onChangeText={setInput}
          placeholder={universal ? 'Message…' : 'Message this bot…'}
          loading={loading}
          onSend={() => { const t = input; setInput(''); voiceBase.current = ''; void send(t); }}
          onAttachment={handleAttachment}
          onVoicePartial={(t) => { if (!voiceBase.current) voiceBase.current = input; setInput(voiceBase.current ? `${voiceBase.current} ${t}` : t); }}
          onVoiceFinal={(t) => { setInput(voiceBase.current ? `${voiceBase.current} ${t}`.trim() : t); voiceBase.current = ''; setVoiceNote('Voice transcript inserted — check it, then tap Send. Nothing was sent automatically.'); }}
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
