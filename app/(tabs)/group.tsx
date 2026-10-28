import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card, LoadingRow } from '../../src/components/ui';
import { createGroupThread, deleteGroupThread, listBots, listGroupMembers, listGroupMessages, listGroupThreads, setGroupMessageApproval } from '../../src/lib/db';
import { runGroupMessage } from '../../src/lib/group';
import { Bot, GroupMessage, GroupThread } from '../../src/lib/types';
import { tokens } from '../../src/lib/tokens';

// Group tab: pick 2+ bots, send one message, each bot replies in turn with
// its own task/personality and its own provider/model, then a summary.
// A bot with no key does NOT fake a reply — it gets a clear status note.
export default function GroupScreen() {
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
      <Text style={styles.title}>Group chat</Text>
      <Text style={styles.sub}>One message, every selected bot replies in turn, then a summary. Bots with no key get a status note, never a fake reply.</Text>
      {error ? <Card><Text style={{ color: tokens.danger }}>{error}</Text></Card> : null}

      {!selected && (
        <>
          <Text style={styles.h}>New group</Text>
          <TextInput accessibilityLabel="Group title" onChangeText={setNewTitle} placeholder="Group title (optional)" style={styles.input} value={newTitle} />
          {bots.map((b) => (
            <Pressable key={b.id} onPress={() => setPicked((p) => (p.includes(b.id) ? p.filter((x) => x !== b.id) : [...p, b.id]))}>
              <Card>
                <View style={styles.row}>
                  <Avatar color={b.avatarColor} icon={b.avatarIcon} size={36} />
                  <Text style={styles.name}>{picked.includes(b.id) ? '☑ ' : '☐ '}{b.name} — {b.role}</Text>
                </View>
              </Card>
            </Pressable>
          ))}
          {bots.length === 0 && <Card><Text style={styles.sub}>No bots yet. Create bots on the Team tab first.</Text></Card>}
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
        </>
      )}

      {selected && (
        <>
          <Button title="← Back to groups" variant="secondary" onPress={() => { setSelected(null); refresh(); }} />
          <Text style={styles.title}>{selected.title}</Text>
          <Text style={styles.sub}>Bots: {members.map((m) => m.name).join(', ') || 'none'}</Text>
          <FlatList
            data={messages}
            keyExtractor={(m) => m.id}
            renderItem={({ item }) => (
              <Card>
                <Text style={styles.name}>{item.role === 'user' ? 'You' : item.role === 'system_note' ? 'Note' : memberName(item.botId)}{item.approvalState ? ` · ${item.approvalState}` : ''}</Text>
                <Text>{item.text}</Text>
                {item.role === 'assistant' && item.approvalState === 'draft' && (
                  <View style={styles.actions}>
                    <Button title="Approve draft" onPress={async () => { await setGroupMessageApproval(item.id, 'approved'); setMessages(await listGroupMessages(selected.id)); }} />
                    <Button title="Reject" variant="secondary" onPress={async () => { await setGroupMessageApproval(item.id, 'rejected'); setMessages(await listGroupMessages(selected.id)); }} />
                  </View>
                )}
              </Card>
            )}
          />
          {messages.length === 0 && <Card><Text style={styles.sub}>No messages yet in this group.</Text></Card>}
          {loading && <LoadingRow label={workingBot ? `${workingBot} is replying…` : 'Group is working…'} />}
          <TextInput accessibilityLabel="Group message" onChangeText={setInput} placeholder="Message the whole group…" style={styles.input} value={input} />
          <Button title={loading ? 'Working…' : 'Send to group'} disabled={loading} onPress={send} />
          <Pressable onPress={async () => { await deleteGroupThread(selected.id); setSelected(null); refresh(); }}>
            <Text style={[styles.sub, { color: tokens.danger, marginTop: 12 }]}>Delete this group</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  h: { fontWeight: '800', marginBottom: 6, marginTop: 12 },
  input: { borderColor: tokens.border, borderRadius: tokens.radius.sm, borderWidth: 1, marginBottom: tokens.space.sm, padding: tokens.space.sm },
  name: { fontWeight: '800' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  sub: { color: tokens.textMuted, marginBottom: 8 },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 4, marginTop: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
