import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Avatar, Card, Chip } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { deleteBot, listBots, saveBot } from '../src/lib/db';
import { Bot } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

export default function BotsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const [bots, setBots] = useState<Bot[]>([]);
  const [search, setSearch] = useState('');
  const refresh = useCallback(() => { listBots(search).then(setBots).catch(() => {}); }, [search]);
  useFocusEffect(refresh);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Bots</Text>
        <View style={{ width: 34 }} />
      </View>
      <View style={styles.body}>
        <TextInput accessibilityLabel="Search bots" onChangeText={setSearch} placeholder="Search bots…" placeholderTextColor={tokens.textMuted} style={styles.search} value={search} />
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
                    <Avatar color={item.avatarColor} label={item.name} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{item.name}</Text>
                        {item.isPinned ? <Chip label="Pinned" /> : null}
                      </View>
                      <Text style={styles.role}>{item.role}</Text>
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
        <Text style={styles.note}>Bots send nothing externally.</Text>
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  actions: { flexDirection: 'row', gap: 20, marginTop: 14 },
  body: { flex: 1, padding: tokens.space.md },
  empty: { color: tokens.textMuted, fontSize: tokens.font.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  link: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  name: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  new: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, marginBottom: tokens.space.md, paddingVertical: 14 },
  newText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700', textAlign: 'center' },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.sm },
  role: { color: tokens.textMuted, fontSize: tokens.font.md },
  row: { flexDirection: 'row', gap: 12 },
  search: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: 12, padding: 14 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.md },
  task: { color: tokens.text, fontSize: tokens.font.md, marginTop: 4 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
