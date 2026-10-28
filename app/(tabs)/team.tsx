import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Button, Card } from '../../src/components/ui';
import { deleteBot, listBots, saveBot } from '../../src/lib/db';
import { Bot } from '../../src/lib/types';
import { tokens } from '../../src/lib/tokens';

export default function TeamScreen() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [search, setSearch] = useState('');
  const refresh = useCallback(() => { listBots(search).then(setBots).catch(() => {}); }, [search]);
  useFocusEffect(refresh);

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>TeamBots</Text>
      <Text style={styles.sub}>Your team of bots. Each bot has one task — that task is its personality.</Text>
      <TextInput accessibilityLabel="Search bots" onChangeText={setSearch} placeholder="Search bots…" style={styles.search} value={search} />
      <Link href="/bot/new" asChild><Pressable style={styles.new}><Text style={styles.newText}>+ Create a bot</Text></Pressable></Link>
      {bots.length === 0 && (
        <Card><Text style={styles.empty}>No bots yet. Create one, give it a task, and it will behave like that task.</Text></Card>
      )}
      <FlatList
        data={bots}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => (
          <Card>
            <Link href={`/chat/${item.id}`} asChild>
              <Pressable>
                <View style={styles.row}>
                  <Avatar color={item.avatarColor} icon={item.avatarIcon} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{item.name} {item.isPinned ? '📌' : ''}</Text>
                    <Text style={styles.role}>{item.role} · {item.model}</Text>
                    <Text style={styles.task} numberOfLines={2}>{item.task}</Text>
                  </View>
                </View>
              </Pressable>
            </Link>
            <View style={styles.actions}>
              <Link href={`/bot/${item.id}`} asChild><Pressable><Text style={styles.link}>Edit / Memory</Text></Pressable></Link>
              <Pressable onPress={async () => { await saveBot({ ...item, isPinned: item.isPinned ? 0 : 1, updatedAt: new Date().toISOString() }); refresh(); }}><Text style={styles.link}>{item.isPinned ? 'Unpin' : 'Pin'}</Text></Pressable>
              <Pressable onPress={async () => { await deleteBot(item.id); refresh(); }}><Text style={[styles.link, { color: tokens.danger }]}>Delete</Text></Pressable>
            </View>
          </Card>
        )}
      />
      <Text style={styles.note}>Phase 1: bots draft and plan. They send, publish, buy, or delete nothing externally.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 16, marginTop: 10 },
  empty: { color: tokens.textMuted },
  link: { color: tokens.accent, fontWeight: '700' },
  name: { fontSize: tokens.font.lg, fontWeight: '800' },
  new: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, marginBottom: tokens.space.md, padding: tokens.space.md },
  newText: { color: tokens.onAccent, fontWeight: '800', textAlign: 'center' },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.sm },
  role: { color: tokens.textMuted },
  row: { flexDirection: 'row', gap: 12 },
  search: { borderColor: tokens.border, borderRadius: tokens.radius.sm, borderWidth: 1, marginBottom: tokens.space.sm, padding: tokens.space.sm },
  sub: { color: tokens.textMuted, marginBottom: tokens.space.md },
  task: { color: tokens.text, marginTop: 4 },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 4 },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
