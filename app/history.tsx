import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { listBots, listChats, listGroupMessages, listGroupThreads, listMessages, listUniversalChats } from '../src/lib/db';
import { getUniversalChatId } from '../src/lib/universal';
import { Bot, Chat, GroupThread } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

type BotChatRow = { chat: Chat; bot: Bot | null; snippet: string };
type GroupRow = { thread: GroupThread; snippet: string };

// History, kept strictly separate, as the user asked: Main Chat
// history, Bots history, and Group Chat history are three separate
// tabs — nothing is mixed. Main Chat lists every Main Chat thread
// (the original thread plus every thread a New chat created), newest
// first; tapping one reopens it in Main Chat. Bots shows every bot's
// own chat separately; Group shows group threads separately.
type Tab = 'main' | 'bots' | 'group';
export default function HistoryScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [universalChats, setUniversalChats] = useState<{ id: string; snippet: string; lastAt: string }[]>([]);
  const [currentUniversalId, setCurrentUniversalId] = useState('');
  const [botRows, setBotRows] = useState<BotChatRow[]>([]);
  const [groupRows, setGroupRows] = useState<GroupRow[]>([]);
  const [tab, setTab] = useState<Tab>('main');

  const refresh = useCallback(() => {
    (async () => {
      const bots = await listBots();
      setUniversalChats(await listUniversalChats().catch(() => []));
      setCurrentUniversalId(await getUniversalChatId().catch(() => ''));
      const chats = await listChats();
      const rows: BotChatRow[] = [];
      for (const chat of chats) {
        const msgs = await listMessages(chat.id).catch(() => []);
        const last = msgs[msgs.length - 1];
        rows.push({ chat, bot: bots.find((b) => b.id === chat.botId) ?? null, snippet: last ? last.text : 'No messages yet.' });
      }
      setBotRows(rows);
      const threads = await listGroupThreads();
      const grows: GroupRow[] = [];
      for (const thread of threads) {
        const msgs = await listGroupMessages(thread.id).catch(() => []);
        const last = msgs[msgs.length - 1];
        grows.push({ thread, snippet: last ? last.text : 'No messages yet.' });
      }
      setGroupRows(grows);
    })().catch(() => {});
  }, []);
  useFocusEffect(refresh);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>History</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        <View style={styles.tabs}>
          {([['main', 'Main Chat'], ['bots', 'Bots'], ['group', 'Group']] as [Tab, string][]).map(([t, label]) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {tab === 'main' && (
          <>
            {universalChats.length === 0 && <Card><Text style={styles.sub}>No Main Chat messages yet.</Text></Card>}
            {universalChats.map((c) => (
              <Pressable key={c.id} onPress={() => router.push({ pathname: '/', params: { chatId: c.id } } as never)}>
                <Card>
                  <View style={styles.row}>
                    <Avatar color="#E7DCC8" label="Main Chat" size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>Main Chat{c.id === currentUniversalId ? ' · Current' : ''}</Text>
                      <Text style={styles.snippet} numberOfLines={2}>{c.snippet}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
        {tab === 'bots' && (
          <>
            {botRows.length === 0 && <Card><Text style={styles.sub}>No bot chats yet. Start one from Main Chat.</Text></Card>}
            {botRows.map((r) => (
              <Pressable key={r.chat.id} onPress={() => router.push(`/chat/${r.chat.botId}` as never)}>
                <Card>
                  <View style={styles.row}>
                    <Avatar color={r.bot?.avatarColor ?? '#E7DCC8'} label={r.bot?.name ?? 'Bot'} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name}>{r.bot?.name ?? 'Bot'}</Text>
                      <Text style={styles.snippet} numberOfLines={2}>{r.snippet}</Text>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        )}
        {tab === 'group' && (
          <>
            {groupRows.length === 0 && <Card><Text style={styles.sub}>No group chats yet. Start one from Group.</Text></Card>}
            {groupRows.map((r) => (
              <Pressable key={r.thread.id} onPress={() => router.push({ pathname: '/group', params: { threadId: r.thread.id } } as never)}>
                <Card>
                  <Text style={styles.name}>{r.thread.title}</Text>
                  <Text style={styles.snippet} numberOfLines={2}>{r.snippet}</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  body: { flex: 1, padding: tokens.space.md },
  h: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  snippet: { color: tokens.textMuted, fontSize: tokens.font.md, marginTop: 2 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md },
  tab: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, flex: 1, paddingVertical: 9 },
  tabActive: { backgroundColor: tokens.text },
  tabText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: tokens.surface },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
