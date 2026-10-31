import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, CheckBox, LoadingRow } from '../src/components/ui';
import { BotAvatar } from '../src/components/BotAvatar';
import { avatarFor } from '../src/lib/avatars';
import { ThreadMenu } from '../src/components/ThreadMenu';
import { buildTranscript, exportChatZip } from '../src/lib/chatExport';
import { linkChatToProject } from '../src/lib/projects';
import { addChatToHome, shortcutUri } from '../src/lib/shortcut';
import { MenuButton } from '../src/components/Drawer';
import { ComposerBar } from '../src/components/ComposerBar';
import { AlertDialog, type AlertDialogButton } from '../src/components/AlertDialog';
import LiveBrowserPanel, { LiveBrowserHandle } from '../src/components/LiveBrowserPanel';
import { parseBrowserCommands, parseBrowserRequest } from '../src/lib/liveBrowser';
import { createGroupThread, deleteGroupThread, getPinnedThreads, listBots, listGroupMembers, listGroupMessages, listGroupThreads, renameGroupThread, togglePinThread } from '../src/lib/db';
import { runGroupMessage } from '../src/lib/group';
import { isRawErrorText } from '../src/lib/errors';
import { saveArtifactFromReply } from '../src/lib/projects';
import { Bot, GroupMessage, GroupThread, newId, nowIso } from '../src/lib/types';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t, translateApproval } from '../src/lib/i18n';

// Group tab: pick 2+ bots, send one message, each bot replies in turn with
// its own task/personality and its own provider/model, in turn.
// A bot with no key does NOT fake a reply — it gets a clear status note.
export default function GroupScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const { threadId } = useLocalSearchParams<{ threadId?: string }>();
  const [bots, setBots] = useState<Bot[]>([]);
  const [threads, setThreads] = useState<GroupThread[]>([]);
  const [threadMembers, setThreadMembers] = useState<Record<string, string[]>>({});
  const [selected, setSelected] = useState<GroupThread | null>(null);
  const [members, setMembers] = useState<Bot[]>([]);
  const [messages, setMessages] = useState<GroupMessage[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [workingBot, setWorkingBot] = useState<string | null>(null);
  const [error, setError] = useState('');
  // A failed group run shows ONLY a number ("Error 503") plus Retry —
  // never a sentence, never raw provider text.
  const [failedCode, setFailedCode] = useState<number | null>(null);
  const [failedText, setFailedText] = useState<string | null>(null);
  const [voiceNote, setVoiceNote] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPinned, setMenuPinned] = useState(false);
  const voiceBase = useRef('');
  // Agent approval card, same as ChatView: an MCP or service call
  // pauses the bot loop here until the user taps Approve or Reject
  // for that exact call. Nothing runs without that tap.
  const [pendingApproval, setPendingApproval] = useState<{ summary: string; preview: string; resolve: (ok: boolean) => void } | null>(null);

  function requestApproval(summary: string, preview: string): Promise<boolean> {
    const translated = translateApproval(language, summary, preview);
    return new Promise((resolve) => {
      pendingApprovalRef.current = resolve;
      setPendingApproval({ summary: translated.summary, preview: translated.preview, resolve });
    });
  }
  const appliedThreadId = useRef<string | null>(null);
  // Cancel (user order 2026-10-30), same as ChatView: while replies
  // are loading, the composer's send button becomes a stop button.
  // Aborting stops the provider call; an approval wait is released
  // with "reject" so the loop can exit. Bots that already replied
  // keep their replies; no error banner is shown for the stop.
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
  // Live in-chat browser for the group thread, same rules as ChatView:
  // user intent opens it, bot [BROWSER ...] commands drive it, tap/type
  // wait for approval, login steps hand control to the user.
  const browserRef = useRef<LiveBrowserHandle>(null);
  const [browserExpanded, setBrowserExpanded] = useState(false);
  // Auto-scroll, same bug and same fix as ChatView (2026-10-30): the
  // group list never scrolled on its own, so the latest message hid
  // behind the composer when the keyboard opened. Sticks to the bottom
  // unless the user scrolled up to read old messages.
  const listRef = useRef<FlatList<GroupMessage> | null>(null);
  const stickToBottom = useRef(true);
  const scrollPending = useRef(false);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => listRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  // New-message scroll, same fix as ChatView (2026-10-30, round 2): a
  // growing message count always scrolls, so an arriving group reply
  // can never sit hidden below the fold.
  const prevMsgCount = useRef(0);
  useEffect(() => {
    if (messages.length > prevMsgCount.current) {
      // Round 4 (bug 2026-10-30, video), same as ChatView: round 3
      // still left a reply's tail clipped under the composer —
      // pending was consumed by the first content-size change while
      // the row's final height landed later, and the animated first
      // scroll could race the deferred jump. Non-animated sticks,
      // pending clears only on an onScroll that reports the bottom
      // reached, 1s expiry so a later scroll-up is never yanked.
      scrollPending.current = true;
      listRef.current?.scrollToEnd({ animated: false });
      setTimeout(() => listRef.current?.scrollToEnd({ animated: false }), 150);
      setTimeout(() => { scrollPending.current = false; }, 1000);
    }
    prevMsgCount.current = messages.length;
  }, [messages.length]);

  const refresh = useCallback(() => {
    listBots().then(setBots).catch(() => {});
    // Past groups shows ONLY threads that actually have messages
    // (bug 2026-10-30, video): Create makes the row at once, so an
    // untouched thread used to sit in the list and open a blank
    // chat. Same rule as History since c2d2df6: a thread appears
    // once its first message lands; a failed read keeps the row.
    // Member names ride along so identical "Group chat" titles can
    // still be told apart.
    (async () => {
      try {
        const ts = await listGroupThreads();
        const withData = await Promise.all(ts.map(async (t) => {
          try {
            const [msgs, mems] = await Promise.all([listGroupMessages(t.id), listGroupMembers(t.id)]);
            return { thread: t, count: msgs.length, members: mems.map((b) => b.name) };
          } catch { return { thread: t, count: null, members: [] as string[] }; }
        }));
        setThreads(withData.filter((d) => d.count === null || d.count > 0).map((d) => d.thread));
        setThreadMembers(Object.fromEntries(withData.map((d) => [d.thread.id, d.members])));
      } catch { /* list stays as it was */ }
    })().catch(() => {});
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
    if (creating) return;
    if (picked.length < 2) { setError(t(language, 'pickAtLeast2')); return; }
    setError('');
    setCreating(true);
    try {
      const thread = await createGroupThread(newTitle, picked);
      setNewTitle('');
      setPicked([]);
      await refresh();
      await openThread(thread);
    } finally {
      setCreating(false);
    }
  }

  async function send(textOverride?: string, reuseUser = false) {
    const raw = textOverride ?? input;
    if (!selected || !raw.trim() || loading) return;
    const browserRequest = parseBrowserRequest(raw.trim());
    if (browserRequest.open) browserRef.current?.open(browserRequest.url);
    setFailedCode(null);
    setFailedText(null);
    setLoading(true);
    abortRef.current = new AbortController();
    const text = raw;
    if (!textOverride) setInput('');
    // Optimistic user bubble (bug 2026-10-30): until now the list only
    // refreshed AFTER every bot replied, so the user's own message was
    // invisible for the whole "X is replying…" wait and only appeared
    // with the replies. Show it at once; the final reload replaces it
    // with the saved copy. The same-text guard keeps a Retry from
    // doubling a bubble that is already on screen.
    if (!messages.some((m) => m.role === 'user' && m.text === text.trim())) {
      setMessages((prev) => [...prev, { id: newId(), threadId: selected.id, botId: null, role: 'user', text: text.trim(), approvalState: null, createdAt: nowIso() }]);
    }
    try {
      const prevIds = new Set(messages.map((m) => m.id));
      await runGroupMessage(selected.id, members, text, setWorkingBot, reuseUser, requestApproval, abortRef.current.signal);
      const updated = await listGroupMessages(selected.id);
      setMessages(updated);
      // Bot browser commands in the new replies drive the panel.
      for (const m of updated) {
        if (!prevIds.has(m.id) && m.role === 'assistant') {
          for (const action of parseBrowserCommands(m.text)) browserRef.current?.requestAction(action);
        }
      }
    } catch {
      // A cancelled turn is not a failure: no error banner, no retry.
      if (!abortRef.current?.signal.aborted) {
        setFailedCode(503);
        setFailedText(text);
      }
    } finally {
      abortRef.current = null;
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

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'BotSquad';

  return (
    <View style={styles.wrap}>
      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        buttons={dialog?.buttons ?? []}
        onDismiss={() => setDialog(null)}
      />
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
          <View style={styles.headerRight}>
            <Pressable
              accessibilityLabel="Start a new group chat"
              onPress={() => { setSelected(null); setInput(''); setFailedCode(null); setFailedText(null); appliedThreadId.current = null; refresh(); }}
              style={styles.newChatButton}
            >
              <Text style={styles.newChatText}>+ New chat</Text>
            </Pressable>
            {messages.length > 0 ? (
              <Pressable
                accessibilityLabel="Export chat as ZIP"
                accessibilityRole="button"
                hitSlop={5}
                onPress={async () => { try { await exportChatZip(selected.title, messages.map((m) => ({ role: m.role, text: m.text }))); } catch { setDialog({ title: 'Export failed', message: 'The ZIP could not be created. Try again.', buttons: [{ text: 'OK' }] }); } }}
                style={styles.menuButton}
              >
                <Feather name="file-text" size={20} color={tokens.text} />
              </Pressable>
            ) : null}
            {messages.length > 0 ? (
              <Pressable
                accessibilityLabel="Group chat menu"
                accessibilityRole="button"
                hitSlop={5}
                onPress={async () => { setMenuPinned((await getPinnedThreads().catch(() => [] as string[])).includes(selected.id)); setMenuOpen(true); }}
                style={styles.menuButton}
              >
                <Feather name="more-vertical" size={20} color={tokens.text} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : (
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle}>Group</Text>
          <View style={{ width: 34 }} />
        </View>
      )}

      {selected && (
        <ThreadMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          target={{ kind: 'group', id: selected.id, title: selected.title, transcript: buildTranscript(selected.title, messages.map((m) => ({ role: m.role, text: m.text }))) }}
          pinned={menuPinned}
          onRename={async (name) => { await renameGroupThread(selected.id, name); setSelected({ ...selected, title: name }); }}
          onTogglePin={async () => { setMenuPinned(await togglePinThread(selected.id)); }}
          onAddToProject={async (projectId) => { await linkChatToProject(projectId, 'group', selected.id, selected.title); }}
          onAddToHome={async () => addChatToHome(selected.title, shortcutUri('group', selected.id))}
          onExportZip={async () => { try { await exportChatZip(selected.title, messages.map((m) => ({ role: m.role, text: m.text }))); } catch { setDialog({ title: 'Export failed', message: 'The ZIP could not be created. Try again.', buttons: [{ text: 'OK' }] }); } }}
          onDelete={async () => { await deleteGroupThread(selected.id); setSelected(null); refresh(); }}
        />
      )}

      {!selected && (
        <View style={styles.body}>
          <Text style={styles.sub}>{t(language, 'groupIntro')}</Text>
          {error ? <Card><Text style={{ color: tokens.danger }}>{error}</Text></Card> : null}
          <Text style={styles.h}>{t(language, 'newGroup')}</Text>
          <TextInput accessibilityLabel="Group title" onChangeText={setNewTitle} placeholder={t(language, 'groupTitlePlaceholder')} placeholderTextColor={tokens.textMuted} style={styles.input} value={newTitle} />
          {bots.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableRow}>
                <View style={styles.tableCheckSpacer} />
                <Text style={[styles.tableCell, styles.tableHead, { flex: 1 }]}>{t(language, 'botNameCol')}</Text>
                <Text style={[styles.tableCell, styles.tableHead, { flex: 1 }]}>{t(language, 'botRoleCol')}</Text>
              </View>
              {bots.map((b) => (
                <Pressable key={b.id} onPress={() => setPicked((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]))} style={[styles.tableRow, styles.tableRowBorder]}>
                  <CheckBox selected={picked.includes(b.id)} />
                  <BotAvatar variant={avatarFor(b.id, b.avatar)} size={36} />
                  <Text style={[styles.tableCell, { flex: 1 }]}>{b.name}</Text>
                  <Text style={[styles.tableCell, styles.tableRole, { flex: 1 }]}>{b.role}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {bots.length === 0 && <Card><Text style={styles.sub}>No bots yet. Create bots on the Bots screen first.</Text></Card>}
          <Button title={t(language, 'createGroup')} disabled={picked.length < 2 || creating} onPress={createThread} />
          <Text style={styles.h}>{t(language, 'pastGroups')}</Text>
          <FlatList
            data={threads}
            keyExtractor={(t) => t.id}
            renderItem={({ item }) => (
              <Card>
                <View style={styles.threadRow}>
                  <Pressable style={styles.threadTitle} onPress={() => openThread(item)}>
                    <Text style={styles.name}>{item.title}</Text>
                    {threadMembers[item.id]?.length ? <Text style={styles.roleText}>{threadMembers[item.id].join(', ')}</Text> : null}
                  </Pressable>
                  <Pressable accessibilityLabel={`Delete group ${item.title}`} onPress={() => setDialog({ title: 'Delete this group?', message: 'Its messages are deleted too. This cannot be undone.', buttons: [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGroupThread(item.id); refresh(); } }] })}>
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
            ref={listRef}
            data={messages}
            keyExtractor={(m) => m.id}
            style={{ flex: 1 }}
            // Bottom buffer (bug 2026-10-30, video): ChatView's list
            // has padding on all sides, but this list had NO content
            // padding, so scrollToEnd parked the last row flush on
            // the composer's top edge and any hair short clipped its
            // last line. This buffer is the margin that was missing.
            contentContainerStyle={{ paddingBottom: tokens.space.md }}
            scrollEventThrottle={16}
            onScroll={(e) => {
              const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
              const distance = contentSize.height - (layoutMeasurement.height + contentOffset.y);
              stickToBottom.current = distance < 120;
              if (distance < 24) scrollPending.current = false;
            }}
            onContentSizeChange={() => {
              if (stickToBottom.current || scrollPending.current) listRef.current?.scrollToEnd({ animated: false });
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
                    <Text style={styles.botLabel}>{item.botId ? memberName(item.botId) : 'Note'}</Text>
                    <Text style={styles.failedText}>Error 503</Text>
                  </View>
                );
              }
              return (
                <View style={styles.assistantRow}>
                  <View style={styles.botHead}>
                    {item.botId ? <BotAvatar variant={avatarFor(item.botId, members.find((m) => m.id === item.botId)?.avatar)} size={28} /> : null}
                    <Text style={styles.botLabel}>{item.role === 'system_note' && !item.botId ? 'Note' : memberName(item.botId)}</Text>
                  </View>
                  <Text style={styles.assistantText}>{item.text}</Text>
                  {item.role === 'assistant' && (
                    <View style={styles.msgActions}>
                      <Pressable
                        accessibilityLabel="Save as artifact"
                        onPress={async () => { await saveArtifactFromReply(item.text); setDialog({ title: t(language, 'saved'), message: t(language, 'savedToArtifacts'), buttons: [{ text: 'OK' }] }); }}
                      >
                        <Text style={styles.saveArtifact}>{t(language, 'saveAsArtifact')}</Text>
                      </Pressable>
                      <Text style={styles.mistakeNote}>AI can make mistakes</Text>
                    </View>
                  )}
                </View>
              );
            }}
          />}
          {loading && <LoadingRow label={workingBot ? `${workingBot} ${t(language, 'isReplying')}` : t(language, 'groupWorking')} />}
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
          <LiveBrowserPanel ref={browserRef} botName={t(language, 'group')} onExpandedChange={setBrowserExpanded} />
          {pendingApproval ? (
            <View style={styles.approvalCard}>
              <Text style={styles.approvalTitle}>{t(language, 'approvalTool')}</Text>
              {workingBot ? <Text style={styles.approvalBot}>{workingBot}</Text> : null}
              <Text style={styles.approvalSummary}>{pendingApproval.summary}</Text>
              <ScrollView style={styles.approvalScroll}>
                <Text style={styles.approvalPreview}>{pendingApproval.preview}</Text>
              </ScrollView>
              <Text style={styles.approvalLength}>{pendingApproval.preview.length} characters — scroll to see all of it before approving.</Text>
              <View style={styles.approvalRow}>
                <Button title={t(language, 'approve')} onPress={() => { pendingApprovalRef.current = null; pendingApproval.resolve(true); setPendingApproval(null); }} />
                <Button title={t(language, 'reject')} variant="secondary" onPress={() => { pendingApprovalRef.current = null; pendingApproval.resolve(false); setPendingApproval(null); }} />
              </View>
            </View>
          ) : null}
          <ComposerBar
            input={input}
            onChangeText={setInput}
            placeholder={t(language, 'messageGroup')}
            loading={loading}
            onSend={() => { void send(); }}
            onCancel={cancelSend}
            onAttachment={(att) => { void handleAttachment(att); }}
            onVoicePartial={(t) => { if (!voiceBase.current) voiceBase.current = input; setInput(voiceBase.current ? `${voiceBase.current} ${t}` : t); }}
            onVoiceFinal={(t) => { setInput(voiceBase.current ? `${voiceBase.current} ${t}`.trim() : t); voiceBase.current = ''; setVoiceNote(''); }}
            onVoiceError={(m) => { voiceBase.current = ''; setVoiceNote(m); }}
          />
        </View>
      )}
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  approvalCard: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginBottom: 8, padding: tokens.space.md },
  approvalPreview: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 6 },
  approvalScroll: { marginTop: 6, maxHeight: 320 },
  approvalLength: { color: tokens.textMuted, fontSize: 12, marginTop: 4 },
  approvalRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  approvalSummary: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600', marginTop: 4 },
  approvalBot: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '700', marginTop: 2 },
  approvalTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800' },
  assistantRow: { marginBottom: 20 },
  assistantText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  body: { flex: 1, padding: tokens.space.md },
  botHead: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 4 },
  botLabel: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  failedRow: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 },
  failedText: { color: tokens.danger, fontSize: tokens.font.md, fontWeight: '700' },
  retryButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: 16, paddingVertical: 8 },
  retryText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  saveArtifact: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700' },
  msgActions: { alignItems: 'center', flexDirection: 'row', gap: 16, marginTop: 8 },
  mistakeNote: { color: tokens.textMuted, fontSize: 12 },
  deleteText: { color: tokens.danger, fontSize: tokens.font.sm, fontWeight: '700' },
  threadRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  threadTitle: { flex: 1 },
  voiceNote: { color: tokens.textMuted, fontSize: tokens.font.sm, marginBottom: 4 },
  h: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerRight: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  menuButton: { alignItems: 'center', backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, height: 34, justifyContent: 'center', width: 34 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: 12, padding: 14 },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  roleText: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  table: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  tableRow: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  tableRowBorder: { borderTopColor: tokens.border, borderTopWidth: 1 },
  // Header spacer = checkbox 22 + gap 10 + avatar 36, so the header's
  // Bot name column starts exactly where the rows' names start.
  tableCheckSpacer: { width: 68 },
  tableCell: { color: tokens.text, fontSize: tokens.font.md },
  tableHead: { color: tokens.textMuted, fontWeight: '800' },
  tableRole: { color: tokens.textMuted },
  newChatButton: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  newChatText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: 8 },
  userBubble: { backgroundColor: tokens.accent, borderRadius: tokens.radius.lg, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userText: { color: tokens.onAccent, fontSize: tokens.font.md, lineHeight: 24 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
