import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { AdSlot, Button, LoadingRow } from './ui';
import { ComposerBar } from './ComposerBar';
import LiveBrowserPanel, { LiveBrowserHandle } from './LiveBrowserPanel';
import { parseBrowserCommands, parseBrowserRequest } from '../lib/liveBrowser';
import { addMemory, addMessage, getBot, getOrCreateChat, getSetting, listBotSkillIds, listBots, listMemory, listMessages, listSkills, saveSkill, setMessageApproval } from '../lib/db';
import { detectAutoSkill } from '../lib/autoSkill';
import { buildSystemPrompt, extractMemoryNote } from '../lib/prompt';
import { saveArtifactFromReply } from '../lib/projects';
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
    model: 'gpt-4o-mini',
    endpoint: undefined,
    isPinned: 0,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export function ChatView({ botId, universal, topBar }: { botId?: string; universal?: boolean; topBar: (bot: Bot | null) => React.ReactNode }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const [bot, setBot] = useState<Bot | null>(() => (universal ? makeUniversalBot() : null));
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatId, setChatId] = useState('');
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  // A failed reply shows ONLY a number ("Error 503") plus Retry — never
  // a sentence, never raw provider text, never a numeric prefix.
  const [failedCode, setFailedCode] = useState<number | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
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
        // Universal chat needs no bot and no chats-table row: it uses
        // the fixed chat id below. addMessage's chats-table updated_at
        // update simply affects 0 rows, which is fine.
        setBot(makeUniversalBot());
        setChatId('universal-chat');
        setMessages(await listMessages('universal-chat'));
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
  }, [botId, universal]);

  // reuseUser: a Retry resends the failed user text WITHOUT adding a
  // second copy of the user's bubble to the chat.
  async function send(text: string, reuseUser = false) {
    if (!bot || !chatId || !text.trim()) return;
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
      const assistantMsg: Message = { id: newId(), chatId, botId: bot.id, role: 'assistant', text: reply, approvalState: 'draft', createdAt: nowIso() };
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
      {topBar(bot)}
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
              <Text style={styles.botLabel}>{bot.name}{item.approvalState ? ` (${item.approvalState})` : ''}</Text>
              <Text style={styles.assistantText}>{item.text}</Text>
              <View style={styles.msgActions}>
                <Pressable
                  accessibilityLabel="Save as artifact"
                  onPress={async () => { await saveArtifactFromReply(item.text); Alert.alert('Saved', 'Saved to Artifacts.'); }}
                >
                  <Text style={styles.saveArtifact}>Save as artifact</Text>
                </Pressable>
              </View>
              {item.approvalState === 'draft' && (
                <View style={styles.approval}>
                  <Button title="Approve draft" onPress={async () => { await setMessageApproval(item.id, 'approved'); setMessages(await listMessages(chatId)); }} />
                  <Button title="Reject" variant="secondary" onPress={async () => { await setMessageApproval(item.id, 'rejected'); setMessages(await listMessages(chatId)); }} />
                </View>
              )}
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
  approval: { flexDirection: 'row', gap: 10, marginTop: 12 },
  assistantRow: { marginBottom: 20 },
  assistantText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  botLabel: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 4 },
  saveArtifact: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700' },
  composerWrap: { paddingBottom: 12, paddingHorizontal: tokens.space.md, paddingTop: 4 },
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
