import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field } from '../../src/components/ui';
import { deleteMemory, getBot, listMemory, saveBot } from '../../src/lib/db';
import { AVATAR_COLORS, AVATAR_ICONS } from '../../src/lib/tokens';
import { Bot, MemoryNote, PROVIDERS, ProviderId, newId, nowIso } from '../../src/lib/types';
import { tokens } from '../../src/lib/tokens';

export default function BotEditScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = id === 'new';
  const [bot, setBot] = useState<Bot>({
    id: newId(), name: '', role: '', avatarColor: AVATAR_COLORS[0] ?? '#2563EB', avatarIcon: AVATAR_ICONS[0] ?? '◆',
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
    <ScrollView style={styles.wrap}>
      <Text style={styles.title}>{isNew ? 'Create a bot' : `Edit ${bot.name}`}</Text>
      <Text style={styles.sub}>Give the bot one specific task. That task is its personality — it will behave like that task.</Text>
      <Field label="Name" onChangeText={(v) => setBot({ ...bot, name: v })} value={bot.name} />
      <Field label="Role" onChangeText={(v) => setBot({ ...bot, role: v })} value={bot.role} />
      <Field label="Task (what it owns)" multiline onChangeText={(v) => setBot({ ...bot, task: v })} value={bot.task} />
      <Field label="Personality (how it talks and works)" multiline onChangeText={(v) => setBot({ ...bot, personality: v })} value={bot.personality} />
      <Field label="Instructions" multiline onChangeText={(v) => setBot({ ...bot, instructions: v })} value={bot.instructions} />
      <Field label="Boundaries (always win)" multiline onChangeText={(v) => setBot({ ...bot, boundaries: v })} value={bot.boundaries} />
      <Field label="Provider" onChangeText={(v) => setBot({ ...bot, provider: v as ProviderId })} value={bot.provider} />
      <Field label="Model" onChangeText={(v) => setBot({ ...bot, model: v })} value={bot.model} />
      <Field label="API endpoint (OpenAI-compatible only; https, no query — blank = OpenAI)" onChangeText={(v) => setBot({ ...bot, endpoint: v })} value={bot.endpoint ?? ''} />
      <Text style={styles.sub}>Provider options: {PROVIDERS.map((p) => p.id).join(', ')}</Text>
      <Button title="Save bot" onPress={save} />
      {!isNew && (
        <View style={{ marginTop: 24 }}>
          <Text style={styles.title}>Memory notes (auto-learned)</Text>
          <Text style={styles.sub}>Visible, editable by deleting, and fed into the next chat. Boundaries always win over these notes.</Text>
          {memory.length === 0 && <Text style={styles.sub}>No memory notes yet.</Text>}
          {memory.map((m) => (
            <Card key={m.id}>
              <Text>{m.note}</Text>
              <Text style={styles.sub}>{m.source} · {m.createdAt}</Text>
              <Button title="Delete note" variant="danger" onPress={async () => { await deleteMemory(m.id); setMemory(await listMemory(bot.id)); }} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  sub: { color: tokens.textMuted, marginBottom: tokens.space.sm },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
