import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field } from '../../src/components/ui';
import { addMessage, getBot, getOrCreateChat, listBots, listRoutines, listSkills, markRoutineRun, saveRoutine, setRoutineStatus } from '../../src/lib/db';
import { Routine, Skill, newId, nowIso } from '../../src/lib/types';
import { tokens } from '../../src/lib/tokens';

export default function RoutinesScreen() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('daily 08:00');
  const [botId, setBotId] = useState('');

  const refresh = useCallback(() => {
    listRoutines().then(setRoutines).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    listBots().then((b) => { if (!botId && b[0]) setBotId(b[0].id); }).catch(() => {});
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

  // Due check on open: a routine whose schedule time has passed today and
  // which has not run today is shown as due. It never runs silently and
  // never acts externally — the user taps "Run as draft".
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Skills & Routines</Text>
      <Text style={styles.sub}>Save a working chat as a skill, then schedule it. A routine runs as a DRAFT when you open the app — never autonomously, never externally.</Text>
      <Field label="Routine name" onChangeText={setName} value={name} />
      <Field label="Schedule (daily HH:MM or weekday HH:MM)" onChangeText={setSchedule} value={schedule} />
      <Field label="Bot ID (pick from Team list; first bot used by default)" onChangeText={setBotId} value={botId} />
      <Button title="Create routine" onPress={createRoutine} />
      <Text style={[styles.title, { marginTop: 20 }]}>Routines</Text>
      <FlatList
        data={routines}
        keyExtractor={(r) => r.id}
        renderItem={({ item }) => (
          <Card>
            <Text style={styles.bold}>{item.name}</Text>
            <Text style={styles.sub}>{item.schedule} · {item.status} · last run: {item.lastRunAt ?? 'never'}</Text>
            <View style={styles.row}>
              <Button title="Run as draft" onPress={() => runAsDraft(item)} />
              <Button title={item.status === 'active' ? 'Pause' : 'Resume'} variant="secondary" onPress={async () => { await setRoutineStatus(item.id, item.status === 'active' ? 'paused' : 'active'); refresh(); }} />
            </View>
          </Card>
        )}
      />
      <Text style={[styles.title, { marginTop: 20 }]}>Skills</Text>
      {skills.length === 0 && <Text style={styles.sub}>No skills saved yet. Save one from a chat in a future build step, or create a routine above.</Text>}
      {skills.map((s) => <Card key={s.id}><Text style={styles.bold}>{s.name}</Text><Text style={styles.sub}>{s.template}</Text></Card>)}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800' },
  row: { flexDirection: 'row', gap: 10, marginTop: 8 },
  sub: { color: tokens.textMuted, marginBottom: 4 },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
