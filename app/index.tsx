import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Avatar, Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { ChatView } from '../src/components/ChatView';
import { listBots } from '../src/lib/db';
import { Bot } from '../src/lib/types';
import { tokens } from '../src/lib/tokens';

// Main Chat — the app's opening screen. It chats with the first bot:
// listBots already orders pinned bots first, so the first bot in the
// list is the pinned bot when one exists, otherwise the first bot.
// The header's bot name opens a switcher to chat with any other bot.
export default function MainChatScreen() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const refresh = useCallback(() => {
    listBots().then((b) => {
      setBots(b);
      if (!selectedId && b[0]) setSelectedId(b[0].id);
      else if (selectedId && !b.some((x) => x.id === selectedId) && b[0]) setSelectedId(b[0].id);
    }).catch(() => {});
  }, [selectedId]);
  useFocusEffect(refresh);

  const selected = bots.find((b) => b.id === selectedId) ?? null;

  if (bots.length === 0) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle}>Main Chat</Text>
          <View style={{ width: 34 }} />
        </View>
        <View style={styles.empty}>
          <Card>
            <Text style={styles.emptyTitle}>No bots yet</Text>
            <Text style={styles.sub}>Create a bot, give it a task, and start chatting with it here.</Text>
            <Link href="/bot/new" asChild>
              <Pressable style={styles.createButton}><Text style={styles.createText}>Create a bot</Text></Pressable>
            </Link>
          </Card>
        </View>
      </View>
    );
  }

  if (!selected) return <View style={styles.wrap}><Text style={styles.sub}>Loading chat…</Text></View>;

  return (
    <ChatView
      botId={selected.id}
      topBar={() => (
        <View>
          <View style={styles.header}>
            <MenuButton />
            <Pressable style={styles.switcherButton} onPress={() => setSwitcherOpen((v) => !v)}>
              <Text style={styles.headerTitle} numberOfLines={1}>{selected.name}</Text>
              <Feather name={switcherOpen ? 'chevron-up' : 'chevron-down'} size={20} color={tokens.text} />
            </Pressable>
            <View style={{ width: 34 }} />
          </View>
          {switcherOpen && (
            <View style={styles.switcher}>
              {bots.map((b) => (
                <Pressable
                  key={b.id}
                  onPress={() => { setSelectedId(b.id); setSwitcherOpen(false); }}
                  style={styles.switcherRow}
                >
                  <Avatar color={b.avatarColor} label={b.name} size={36} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.switcherName}>{b.name}</Text>
                    <Text style={styles.sub}>{b.role}</Text>
                  </View>
                  {b.id === selected.id ? <Feather name="check" size={20} color={tokens.text} /> : null}
                </Pressable>
              ))}
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  createButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, marginTop: 14, paddingVertical: 14 },
  createText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700', textAlign: 'center' },
  empty: { padding: tokens.space.md },
  emptyTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 6 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md },
  switcher: { backgroundColor: tokens.surface, borderBottomColor: tokens.border, borderBottomWidth: 1, paddingHorizontal: tokens.space.md, paddingBottom: 8 },
  switcherButton: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  switcherName: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  switcherRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
