import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteSkill, listBotSkillIds, listBots, listSkills, saveSkill, toggleBotSkill } from '../src/lib/db';
import { Bot, Skill, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

export default function SkillsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [skills, setSkills] = useState<Skill[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [msg, setMsg] = useState('');

  const [skillName, setSkillName] = useState('');
  const [skillTemplate, setSkillTemplate] = useState('');

  const refresh = useCallback(() => {
    listBots().then((b) => { setBots(b); if (!selectedBot && b[0]) setSelectedBot(b[0].id); }).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    if (selectedBot) {
      listBotSkillIds(selectedBot).then(setEnabledSkills).catch(() => {});
    }
  }, [selectedBot]);
  useFocusEffect(refresh);

  async function addSkill() {
    if (!skillName.trim() || !skillTemplate.trim()) { Alert.alert('Missing fields', 'A skill needs a name and instruction text.'); return; }
    await saveSkill({ id: newId(), botId: null, name: skillName.trim(), template: skillTemplate, source: 'local', repoUrl: null, permissions: '', createdAt: nowIso() });
    setSkillName(''); setSkillTemplate('');
    setMsg('Skill saved. Enable it for a bot below.');
    refresh();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Skills</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.bold}>Selected bot for enabling</Text>
      {bots.map((b) => (
        <Button key={b.id} title={b.name} variant={selectedBot === b.id ? 'primary' : 'secondary'} onPress={() => setSelectedBot(b.id)} />
      ))}
      {msg ? <Card><Text>{msg}</Text></Card> : null}

      <Text style={[styles.title, { marginTop: 20 }]}>Add a skill</Text>
      <Field label="Skill name" onChangeText={setSkillName} value={skillName} />
      <Field label="Skill instructions (markdown)" multiline onChangeText={setSkillTemplate} value={skillTemplate} />
      <Button title="Save skill" onPress={addSkill} />
      {skills.map((s) => (
        <Card key={s.id}>
          <Text style={styles.bold}>{s.name} ({s.source})</Text>
          <Text style={styles.sub} numberOfLines={3}>{s.template}</Text>
          {s.repoUrl ? <Text style={styles.sub}>{s.repoUrl}</Text> : null}
          <Button title={enabledSkills.includes(s.id) ? 'Enabled for selected bot' : 'Enable for selected bot'} variant={enabledSkills.includes(s.id) ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; const on = !enabledSkills.includes(s.id); await toggleBotSkill(selectedBot, s.id, on); refresh(); }} />
          <View style={{ height: 8 }} />
          <Button title="Delete skill" variant="danger" onPress={async () => { await deleteSkill(s.id); refresh(); }} />
        </Card>
      ))}
    </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
