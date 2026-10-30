import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Card, Chip } from '../src/components/ui';
import { BotAvatar } from '../src/components/BotAvatar';
import { avatarFor } from '../src/lib/avatars';
import { MenuButton } from '../src/components/Drawer';
import { deleteBot, listBots, saveBot } from '../src/lib/db';
import { Bot } from '../src/lib/types';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

export default function BotsScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const [bots, setBots] = useState<Bot[]>([]);
  const [search, setSearch] = useState('');
  // New-chat mode (user order 2026-10-30): this list was reached via
  // drawer New chat, so every bot opened from here starts a brand-new
  // thread; old threads stay in History. A plain visit to Bots (no
  // fresh param) opens each bot's latest thread as before.
  const { fresh } = useLocalSearchParams<{ fresh?: string }>();
  const freshMode = fresh === '1';
  const refresh = useCallback(() => { listBots(search).then(setBots).catch(() => {}); }, [search]);
  useFocusEffect(refresh);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>{t(language, 'bots')}</Text>
        <View style={{ width: 34 }} />
      </View>
      <View style={styles.body}>
        <TextInput accessibilityLabel="Search bots" onChangeText={setSearch} placeholder={t(language, 'searchBots')} placeholderTextColor={tokens.textMuted} style={styles.search} value={search} />
        {freshMode ? <Text style={styles.freshNote}>New chat: jo bot khologe, uski nayi chat khulegi.</Text> : null}
        <Link href="/bot/new" asChild><Pressable style={styles.new}><Text style={styles.newText}>{t(language, 'createBot')}</Text></Pressable></Link>
        {bots.length === 0 && (
          <Card><Text style={styles.empty}>{t(language, 'noBotsYet')}</Text></Card>
        )}
        <FlatList
          data={bots}
          keyExtractor={(b) => b.id}
          renderItem={({ item }) => (
            <Card>
              <Link href={freshMode ? `/chat/${item.id}?fresh=1` : `/chat/${item.id}`} asChild>
                <Pressable>
                  <View style={styles.row}>
                    <BotAvatar variant={avatarFor(item.id, item.avatar)} size={44} />
                    <View style={{ flex: 1 }}>
                      <View style={styles.nameRow}>
                        <Text style={styles.name}>{item.name}</Text>
                        {item.isPinned ? <Chip label={t(language, 'pinned')} /> : null}
                      </View>
                      <Text style={styles.role}>{item.role}</Text>
                      <Text style={styles.task} numberOfLines={2}>{item.task}</Text>
                    </View>
                  </View>
                </Pressable>
              </Link>
              <View style={styles.actions}>
                <Link href={`/bot/${item.id}`} asChild><Pressable><Text style={styles.link}>{t(language, 'editMemory')}</Text></Pressable></Link>
                <Pressable onPress={async () => { await saveBot({ ...item, isPinned: item.isPinned ? 0 : 1, updatedAt: new Date().toISOString() }); refresh(); }}><Text style={styles.link}>{item.isPinned ? t(language, 'unpin') : t(language, 'pin')}</Text></Pressable>
                <Pressable onPress={async () => { await deleteBot(item.id); refresh(); }}><Text style={[styles.link, { color: tokens.danger }]}>{t(language, 'delete')}</Text></Pressable>
              </View>
            </Card>
          )}
        />
        <Text style={styles.note}>{t(language, 'botsNote')}</Text>
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  actions: { flexDirection: 'row', gap: 20, marginTop: 14 },
  body: { flex: 1, padding: tokens.space.md },
  empty: { color: tokens.textMuted, fontSize: tokens.font.md },
  freshNote: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: 12 },
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
