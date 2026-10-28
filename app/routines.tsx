import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { addMessage, getBot, getOrCreateChat, listBots, listRoutines, listSkills, markRoutineRun, saveRoutine, setRoutineStatus } from '../src/lib/db';
import { Bot, Routine, Skill, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

// Reached from Settings. A routine runs as a DRAFT when you open the
// app — never autonomously, never externally.
export default function RoutinesScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('daily 08:00');
  const [botId, setBotId] = useState('');

  const refresh = useCallback(() => {
    listRoutines().then(setRoutines).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    listBots().then((b) => {
      setBots(b);
      if (!botId && b[0]) setBotId(b[0].id);
    }).catch(() => {});
  }, [botId]);
  useFocusEffect(refresh);

  async function createRoutine() {
    if (!name.trim() || !botId) return;
    await saveRoutine({ id: newId(), botId, skillId: null, name: name.trim(), schedule, status: 'active', lastRunAt: null, createdAt: nowIso() });
    setName('');
    refresh();
  }

  async function runAsDraft(r: Routine) {
    const bot = await getBot(r.botId);
    if (!bot) return;
    const chat = await getOrCreateChat(bot.id);
    await addMessage({ id: newId(), chatId: chat.id, botId: bot.id, role: 'assistant', text: `Routine draft: ${r.name} (${r.schedule}). This is a DRAFT for your approval — nothing was sent or changed externally.`, approvalState: 'draft', createdAt: nowIso() });
    await markRoutineRun(r.id);
    refresh();
  }

  const botName = (id: string) => bots.find((b) => b.id === id)?.name ?? 'Bot';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Routines</Text>
        <View style={{ width: 84 }} />
      </View>
      <View style={styles.body}>
        <Text style={styles.sub}>Save a working chat as a skill, then schedule it.</Text>
        <Field label="Routine name" onChangeText={setName} value={name} />
        <Field label="Schedule (daily HH:MM or weekday HH:MM)" onChangeText={setSchedule} value={schedule} />
        <Text style={styles.label}>Bot</Text>
        <View style={styles.chips}>
          {bots.map((b) => (
            <Pressable key={b.id} onPress={() => setBotId(b.id)} style={[styles.chip, botId === b.id && styles.chipSelected]}>
              <Text style={[styles.chipText, botId === b.id && styles.chipTextSelected]}>{b.name}</Text>
            </Pressable>
          ))}
          {bots.length === 0 && <Text style={styles.sub}>No bots yet. Create a bot first.</Text>}
        </View>
        <Button title="Create routine" onPress={createRoutine} />
        <Text style={[styles.title, { marginTop: 24 }]}>Routines</Text>
        <FlatList
          data={routines}
          keyExtractor={(r) => r.id}
          renderItem={({ item }) => (
            <Card>
              <Text style={styles.bold}>{item.name}</Text>
              <Text style={styles.sub}>{botName(item.botId)}, {item.schedule}, {item.status}, last run: {item.lastRunAt ?? 'never'}</Text>
              <View style={styles.row}>
                <Button title="Run as draft" onPress={() => runAsDraft(item)} />
                <Button title={item.status === 'active' ? 'Pause' : 'Resume'} variant="secondary" onPress={async () => { await setRoutineStatus(item.id, item.status === 'active' ? 'paused' : 'active'); refresh(); }} />
              </View>
            </Card>
          )}
        />
        <Text style={[styles.title, { marginTop: 24 }]}>Skills</Text>
        {skills.length === 0 && <Text style={styles.sub}>No skills saved yet. Save one from a chat, or create a routine above.</Text>}
        {skills.map((s) => <Card key={s.id}><Text style={styles.bold}>{s.name}</Text><Text style={styles.sub}>{s.template}</Text></Card>)}
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800' },
  chip: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  chipSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent },
  chipText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  chipTextSelected: { color: tokens.onAccent },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  label: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: 4 },
  title: { color: tokens.text, fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
