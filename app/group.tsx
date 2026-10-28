import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar, Button, Card, CheckBox, LoadingRow } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { createGroupThread, deleteGroupThread, listBots, listGroupMembers, listGroupMessages, listGroupThreads, setGroupMessageApproval } from '../src/lib/db';
import { runGroupMessage } from '../src/lib/group';
import { Bot, GroupMessage, GroupThread } from '../src/lib/types';
import { tokens } from '../src/lib/tokens';

// Group tab: pick 2+ bots, send one message, each bot replies in turn with
// its own task/personality and its own provider/model, then a summary.
// A bot with no key does NOT fake a reply — it gets a clear status note.
export default function GroupScreen() {
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
  const appliedThreadId = useRef<string | null>(null);

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

  async function send() {
    if (!selected || !input.trim() || loading) return;
    setError('');
    setLoading(true);
    const text = input;
    setInput('');
    try {
      await runGroupMessage(selected.id, members, text, setWorkingBot);
      setMessages(await listGroupMessages(selected.id));
    } catch {
      setError('Group run failed. Your message was not lost — check the thread and try again.');
    } finally {
      setLoading(false);
      setWorkingBot(null);
    }
  }

  const memberName = (id: string | null) => members.find((m) => m.id === id)?.name ?? 'TeamBots';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Group</Text>
        <View style={{ width: 34 }} />
      </View>

      {!selected && (
        <View style={styles.body}>
          <Text style={styles.sub}>One message, every selected bot replies in turn, then a summary.</Text>
          {error ? <Card><Text style={{ color: tokens.danger }}>{error}</Text></Card> : null}
          <Text style={styles.h}>New group</Text>
          <TextInput accessibilityLabel="Group title" onChangeText={setNewTitle} placeholder="Group title (optional)" placeholderTextColor={tokens.textMuted} style={styles.input} value={newTitle} />
          {bots.map((b) => (
            <Pressable key={b.id} onPress={() => setPicked((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]))}>
              <Card>
                <View style={styles.row}>
                  <Avatar color={b.avatarColor} label={b.name} size={36} />
                  <CheckBox selected={picked.includes(b.id)} />
                  <Text style={styles.name}>{b.name} — {b.role}</Text>
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
              <Pressable onPress={() => openThread(item)}>
                <Card><Text style={styles.name}>{item.title}</Text></Card>
              </Pressable>
            )}
          />
        </View>
      )}

      {selected && (
        <View style={styles.body}>
          <Pressable onPress={() => { setSelected(null); refresh(); }} style={styles.backRow}>
            <Feather name="chevron-left" size={20} color={tokens.text} />
            <Text style={styles.backText}>Back to groups</Text>
          </Pressable>
          <Text style={styles.title}>{selected.title}</Text>
          <Text style={styles.sub}>Bots: {members.map((m) => m.name).join(', ') || 'none'}</Text>
          <FlatList
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
              return (
                <View style={styles.assistantRow}>
                  <Text style={styles.botLabel}>{item.role === 'system_note' ? 'Note' : memberName(item.botId)}{item.approvalState ? ` · ${item.approvalState}` : ''}</Text>
                  <Text style={styles.assistantText}>{item.text}</Text>
                  {item.role === 'assistant' && item.approvalState === 'draft' && (
                    <View style={styles.actions}>
                      <Button title="Approve draft" onPress={async () => { await setGroupMessageApproval(item.id, 'approved'); setMessages(await listGroupMessages(selected.id)); }} />
                      <Button title="Reject" variant="secondary" onPress={async () => { await setGroupMessageApproval(item.id, 'rejected'); setMessages(await listGroupMessages(selected.id)); }} />
                    </View>
                  )}
                </View>
              );
            }}
          />
          {messages.length === 0 && <Card><Text style={styles.sub}>No messages yet in this group.</Text></Card>}
          {loading && <LoadingRow label={workingBot ? `${workingBot} is replying…` : 'Group is working…'} />}
          <View style={styles.composer}>
            <TextInput accessibilityLabel="Group message" onChangeText={setInput} placeholder="Message the whole group…" placeholderTextColor={tokens.textMuted} style={styles.composerInput} value={input} />
            <Pressable accessibilityLabel="Send to group" disabled={loading} onPress={send} style={[styles.sendButton, loading && styles.sendDisabled]}>
              <Feather name="send" size={18} color={tokens.onAccent} />
            </Pressable>
          </View>
          <Pressable onPress={async () => { await deleteGroupThread(selected.id); setSelected(null); refresh(); }}>
            <Text style={[styles.sub, { color: tokens.danger, marginTop: 12 }]}>Delete this group</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  assistantRow: { marginBottom: 20 },
  assistantText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  botLabel: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 4 },
  composer: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 8 },
  composerInput: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.lg, borderWidth: 1, color: tokens.text, flex: 1, fontSize: tokens.font.md, paddingHorizontal: 14, paddingVertical: 12 },
  h: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: 12, padding: 14 },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sendButton: { alignItems: 'center', backgroundColor: tokens.accent, borderRadius: 999, height: 48, justifyContent: 'center', width: 48 },
  sendDisabled: { opacity: 0.5 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: 8 },
  title: { color: tokens.text, fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 4, marginTop: 8 },
  userBubble: { backgroundColor: tokens.accent, borderRadius: tokens.radius.lg, maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 10 },
  userRow: { alignItems: 'flex-end', marginBottom: 16 },
  userText: { color: tokens.onAccent, fontSize: tokens.font.md, lineHeight: 24 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
