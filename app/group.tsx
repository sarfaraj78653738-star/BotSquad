import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, CheckBox, LoadingRow } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { ComposerBar } from '../src/components/ComposerBar';
import LiveBrowserPanel, { LiveBrowserHandle } from '../src/components/LiveBrowserPanel';
import { parseBrowserCommands, parseBrowserRequest } from '../src/lib/liveBrowser';
import { createGroupThread, deleteGroupThread, listBots, listGroupMembers, listGroupMessages, listGroupThreads, setGroupMessageApproval } from '../src/lib/db';
import { runGroupMessage } from '../src/lib/group';
import { isRawErrorText } from '../src/lib/errors';
import { saveArtifactFromReply } from '../src/lib/projects';
import { Bot, GroupMessage, GroupThread } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

// Group tab: pick 2+ bots, send one message, each bot replies in turn with
// its own task/personality and its own provider/model, then a summary.
// A bot with no key does NOT fake a reply — it gets a clear status note.
export default function GroupScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const { threadId } = useLocalSearchParams<{ threadId?: string }>();
  const [bots, setBots] = useState<Bot[]>([]);
  const [threads, setThreads] = useState<GroupThread[]>([]);
  const [selected, setSelected] = useState<GroupThread | null>(null);
  const [members, setMembers] = useState<Bot[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [workingBot, setWorkingBot] = useState<string | null>(null);
  const [error, setError] = useState('');
  // A failed group run shows ONLY a number ("Error 503") plus Retry —
  // never a sentence, never raw provider text.
  const [failedCode, setFailedCode] = useState<number | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const voiceBase = useRef('');
  const appliedThreadId = useRef<string | null>(null);
  // Live in-chat browser for the group thread, same rules as ChatView:
  // user intent opens it, bot [BROWSER ...] commands drive it, tap/type
  // wait for approval, login steps hand control to the user.
  const browserRef = useRef<LiveBrowserHandle>(null);
  const [browserExpanded, setBrowserExpanded] = useState(false);

  const refresh = useCallback(() => {
    listBots().then(setBots).catch(() => {});
    listGroupThreads().then(setThreads).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  async function openThread(t: GroupThread) {
    setSelected(t);
    setMembers(await listGroupMembers(t.id));
    setMessages(await listGroupMessages(t.id));
  }

  // History can pass a thread id to open that thread directly. The ref
  // guard stops it reopening after the user taps back to the list.
  useEffect(() => {
    const id = Array.isArray(threadId) ? threadId[0] : threadId;
    if (!id || appliedThreadId.current === id) return;
    const t = threads.find((x) => x.id === id);
    if (t) {
      appliedThreadId.current = id;
      void openThread(t);
    }
  }, [threadId, threads]);

  async function createThread() {
    if (picked.length < 2) { setError('Pick at least 2 bots for a group chat.'); return; }
    setError('');
    const t = await createGroupThread(newTitle, picked);
    setNewTitle('');
    setPicked([]);
    await refresh();
    await openThread(t);
  }

  async function send(textOverride?: string, reuseUser = false) {
    const raw = textOverride ?? input;
    if (!selected || !raw.trim() || loading) return;
    const browserRequest = parseBrowserRequest(raw.trim());
    if (browserRequest.open) browserRef.current?.open(browserRequest.url);
    setFailedCode(null);
    setFailedText(null);
    setLoading(true);
    const text = raw;
    if (!textOverride) setInput('');
    try {
      const prevIds = new Set(messages.map((m) => m.id));
      await runGroupMessage(selected.id, members, text, setWorkingBot, reuseUser);
      const updated = await listGroupMessages(selected.id);
      setMessages(updated);
      // Bot browser commands in the new replies drive the panel.
      for (const m of updated) {
        if (!prevIds.has(m.id) && m.role === 'assistant') {
          for (const action of parseBrowserCommands(m.text)) browserRef.current?.requestAction(action);
        }
      }
    } catch {
      setFailedCode(503);
      setFailedText(text);
    } finally {
      setLoading(false);
      setWorkingBot(null);
    }
  }

  function formatSize(size: number | null): string {
    if (size === null) return 'unknown size';
    if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
    if (size >= 1024) return `${Math.round(size / 1024)} KB`;
    return `${size} B`;
  }

  // Attachment note only: the file is never uploaded or read. Bots reply
  // to this note honestly, not to fake file contents.
  async function handleAttachment(att: { name: string; size: number | null; kind: 'photo' | 'document' }) {
    await send(`[Attachment: ${att.name} (${formatSize(att.size)})] — the file itself was not uploaded or read; treat this only as a note that the user attached it.`);
  }

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'TeamBots';

  return (
    <View style={styles.wrap}>
      {selected ? (
        // Inside a thread there is deliberately NO Back button anymore:
        // the left control is the drawer menu, exactly like every other
        // main screen, so the user can switch anywhere from here. The
        // way back to the group list is "+ New chat": it leaves the
        // thread (nothing is deleted) and opens the new-group form, so
        // tapping it starts a new group. The drawer alone cannot do
        // that, because tapping "Group" in the drawer while already on
        // the Group screen does nothing.
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle} numberOfLines={1}>{selected.title}</Text>
          <Pressable
            accessibilityLabel="Start a new group chat"
            onPress={() => { setSelected(null); setInput(''); setFailedCode(null); setFailedText(null); appliedThreadId.current = null; refresh(); }}
            style={styles.newChatButton}
          >
            <Text style={styles.newChatText}>+ New chat</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle}>Group</Text>
          <View style={{ width: 34 }} />
        </View>
      )}

      {!selected && (
        <View style={styles.body}>
          <Text style={styles.sub}>Bots reply in turn, then a summary.</Text>
          {error ? <Card><Text style={{ color: tokens.danger }}>{error}</Text></Card> : null}
          <Text style={styles.h}>New group</Text>
          <TextInput accessibilityLabel="Group title" onChangeText={setNewTitle} placeholder="Group title (optional)" placeholderTextColor={tokens.textMuted} style={styles.input} value={newTitle} />
          {bots.map((b) => (
            <Pressable key={b.id} onPress={() => setPicked((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]))}>
              <Card>
                <View style={styles.row}>
                  <Avatar color={b.avatarColor} label={b.name} size={36} />
                  <CheckBox selected={picked.includes(b.id)} />
                  <Text style={styles.name}>{b.name}, {b.role}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
          {bots.length === 0 && <Card><Text style={styles.sub}>No bots yet. Create bots on the Bots screen first.</Text></Card>}
          <Button title="Create group (2+ bots)" disabled={picked.length < 2} onPress={createThread} />
          <Text style={styles.h}>Past groups</Text>
          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <Card>
                <View style={styles.threadRow}>
                  <Pressable style={styles.threadTitle} onPress={() => openThread(item)}>
                    <Text style={styles.name}>{item.title}</Text>
                  </Pressable>
                  <Pressable accessibilityLabel={`Delete group ${item.title}`} onPress={() => Alert.alert('Delete this group?', 'Its messages are deleted too. This cannot be undone.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGroupThread(item.id); refresh(); } }])}>
                    <Text style={styles.deleteText}>Delete</Text>
                  </Pressable>
                </View>
              </Card>
            )}
          />
        </View>
      )}

      {selected && (
        <View style={styles.body}>
          <Text style={styles.sub}>Bots: {members.map((m) => m.name).join(', ') || 'none'}</Text>
          {browserExpanded ? null : <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
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
                    <Text style={styles.botLabel}>{item.botId ? memberName(item.botId) : 'Note'}</Text>
                    <Text style={styles.failedText}>Error 503</Text>
                  </View>
                );
              }
              return (
                <View style={styles.assistantRow}>
                  <Text style={styles.botLabel}>{item.role === 'system_note' && !item.botId ? 'Note' : memberName(item.botId)}{item.approvalState ? ` (${item.approvalState})` : ''}</Text>
                  <Text style={styles.assistantText}>{item.text}</Text>
                  {item.role === 'assistant' && (
                    <Pressable
                      accessibilityLabel="Save as artifact"
                      onPress={async () => { await saveArtifactFromReply(item.text); Alert.alert('Saved', 'Saved to Artifacts.'); }}
                    >
                      <Text style={styles.saveArtifact}>Save as artifact</Text>
                    </Pressable>
                  )}
                  {item.role === 'assistant' && item.approvalState === 'draft' && (
                    <View style={styles.actions}>
                      <Button title="Approve draft" onPress={async () => { await setGroupMessageApproval(item.id, 'approved'); setMessages(await listGroupMessages(selected.id)); }} />
                      <Button title="Reject" variant="secondary" onPress={async () => { await setGroupMessageApproval(item.id, 'rejected'); setMessages(await listGroupMessages(selected.id)); }} />
                    </View>
                  )}
                </View>
              );
            }}
          />}
          {loading && <LoadingRow label={workingBot ? `${workingBot} is replying…` : 'Group is working…'} />}
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
          <LiveBrowserPanel ref={browserRef} botName="Group" onExpandedChange={setBrowserExpanded} />
          <ComposerBar
            input={input}
            onChangeText={setInput}
            placeholder="Message the whole group…"
            loading={loading}
            onSend={() => { void send(); }}
            onAttachment={(att) => { void handleAttachment(att); }}
            onVoicePartial={(t) => { if (!voiceBase.current) voiceBase.current = input; setInput(voiceBase.current ? `${voiceBase.current} ${t}` : t); }}
            onVoiceFinal={(t) => { setInput(voiceBase.current ? `${voiceBase.current} ${t}`.trim() : t); voiceBase.current = ''; setVoiceNote('Voice transcript inserted — check it, then tap Send. Nothing was sent automatically.'); }}
            onVoiceError={(m) => { voiceBase.current = ''; setVoiceNote(m); }}
          />
        </View>
      )}
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  assistantRow: { marginBottom: 20 },
  assistantText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  body: { flex: 1, padding: tokens.space.md },
  botLabel: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 4 },
  failedRow: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  failedText: { color: tokens.danger, fontSize: tokens.font.md, fontWeight: '700' },
  retryButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  saveArtifact: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700', marginTop: 8 },
  deleteText: { color: tokens.danger, fontSize: tokens.font.sm, fontWeight: '700' },
  threadRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  threadTitle: { flex: 1 },
  voiceNote: { color: tokens.textMuted, fontSize: tokens.font.sm, marginBottom: 4 },
  h: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: 12, padding: 14 },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  newChatButton: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  newChatText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: 8 },
  userBubble: { backgroundColor: tokens.accent, borderRadius: tokens.radius.lg, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userText: { color: tokens.onAccent, fontSize: tokens.font.md, lineHeight: 24 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
