import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../../src/components/ui';
import { AvatarPicker } from '../../src/components/AvatarPicker';
import { AVATAR_VARIANTS } from '../../src/lib/avatars';
import { deleteMemory, getBot, listMemory, saveBot } from '../../src/lib/db';
import { AVATAR_COLORS, AVATAR_ICONS } from '../../src/lib/tokens';
import { Bot, MemoryNote, newId, nowIso } from '../../src/lib/types';
import { useTokens } from '../../src/lib/tokens';

export default function BotEditScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';
  const [bot, setBot] = useState<Bot>({
    id: newId(), name: '', role: '', avatarColor: AVATAR_COLORS[0] ?? '#E7DCC8', avatarIcon: AVATAR_ICONS[0] ?? '◆', avatar: AVATAR_VARIANTS[0]?.id,
    task: '', personality: '', instructions: '', boundaries: 'Never send, publish, buy, or delete anything externally. Drafts need user approval.',
    provider: 'openai-compatible', model: 'gpt-4o-mini', isPinned: 0, createdAt: nowIso(), updatedAt: nowIso(),
  });
  const [memory, setMemory] = useState<MemoryNote[]>([]);

  useEffect(() => {
    (async () => {
      if (!isNew && id) {
        const b = await getBot(id);
        if (b) setBot(b);
        setMemory(await listMemory(id));
      }
    })().catch(() => {});
  }, [id, isNew]);

  async function save() {
    if (!bot.name.trim() || !bot.task.trim()) { Alert.alert('Missing fields', 'A bot needs at least a name and a task.'); return; }
    await saveBot({ ...bot, updatedAt: nowIso() });
    router.back();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back" onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/bots'); }} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{isNew ? 'Create a bot' : `Edit ${bot.name}`}</Text>
        <View style={{ width: 68 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.sub}>One task = its personality.</Text>
      <Text style={styles.title}>Avatar — pick one for this bot</Text>
      <AvatarPicker value={bot.avatar} onChange={(id) => setBot({ ...bot, avatar: id })} />
      <Field label="Name" onChangeText={(v) => setBot({ ...bot, name: v })} value={bot.name} />
      <Field label="Role" onChangeText={(v) => setBot({ ...bot, role: v })} value={bot.role} />
      <Field label="Task (what it owns)" multiline onChangeText={(v) => setBot({ ...bot, task: v })} value={bot.task} />
      <Field label="Personality (how it talks and works)" multiline onChangeText={(v) => setBot({ ...bot, personality: v })} value={bot.personality} />
      <Field label="Instructions" multiline onChangeText={(v) => setBot({ ...bot, instructions: v })} value={bot.instructions} />
      <Field label="Boundaries (always win)" multiline onChangeText={(v) => setBot({ ...bot, boundaries: v })} value={bot.boundaries} />
      <Button title="Save bot" onPress={save} />
      {!isNew && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.title}>Memory notes (auto-learned)</Text>
          <Text style={styles.sub}>Delete a note to remove it. Boundaries always win.</Text>
          {memory.length === 0 && <Text style={styles.sub}>No memory notes yet.</Text>}
          {memory.map((m) => (
            <Card key={m.id}>
              <Text>{m.note}</Text>
              <Text style={styles.sub}>{m.source}, {m.createdAt}</Text>
              <Button title="Delete note" variant="danger" onPress={async () => { await deleteMemory(m.id); setMemory(await listMemory(bot.id)); }} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
