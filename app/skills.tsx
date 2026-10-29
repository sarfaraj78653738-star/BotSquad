import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteSkill, listSkills, saveSkill } from '../src/lib/db';
import { Skill, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

// Skills (user order 2026-10-29): this screen is ONLY the library of
// skills the user saved. No per-bot enabling, no "selected bot"
// picker — that model is gone. To use a skill, the user calls it out
// at the start of a chat message ("/skill-name ..." or "Skill Name,
// ..."), and it applies for that turn only. Tapping a skill opens
// its detail: full instructions, Edit, Delete.
export default function SkillsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [msg, setMsg] = useState('');
  const [detail, setDetail] = useState<Skill | null>(null);

  const [skillName, setSkillName] = useState('');
  const [skillTemplate, setSkillTemplate] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    listSkills().then(setSkills).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  async function addSkill() {
    if (!skillName.trim() || !skillTemplate.trim()) { Alert.alert('Missing fields', 'A skill needs a name and instruction text.'); return; }
    if (editingId) {
      const original = skills.find((s) => s.id === editingId);
      await saveSkill({ id: editingId, botId: original ? original.botId : null, name: skillName.trim(), template: skillTemplate, source: original ? original.source : 'local', repoUrl: original ? original.repoUrl : null, permissions: original ? original.permissions : '', createdAt: original ? original.createdAt : nowIso() });
      setEditingId(null);
      setMsg('Skill updated.');
    } else {
      await saveSkill({ id: newId(), botId: null, name: skillName.trim(), template: skillTemplate, source: 'local', repoUrl: null, permissions: '', createdAt: nowIso() });
      setMsg('Skill saved.');
    }
    setSkillName(''); setSkillTemplate('');
    refresh();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Skills</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        {detail ? (
          <>
            <Pressable onPress={() => setDetail(null)} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>Skills</Text>
            </Pressable>
            <Text style={styles.title}>{detail.name}</Text>
            <Text style={styles.sub}>Source: {detail.source}{detail.repoUrl ? ` — ${detail.repoUrl}` : ''}</Text>
            <Text style={styles.bodyText}>{detail.template}</Text>
            <Button title="Edit skill" variant="secondary" onPress={() => { setEditingId(detail.id); setSkillName(detail.name); setSkillTemplate(detail.template); setDetail(null); }} />
            <View style={{ height: 8 }} />
            <Button title="Delete skill" variant="danger" onPress={() => Alert.alert('Delete this skill?', `${detail.name} will be removed.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => { await deleteSkill(detail.id); setDetail(null); refresh(); } },
            ])} />
          </>
        ) : (
          <>
            <Text style={styles.sub}>To use a skill in chat, start your message with /skill-name.</Text>
            {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
            <Text style={[styles.title, { marginTop: 8 }]}>{editingId ? 'Edit skill' : 'Add a skill'}</Text>
            <Field label="Skill name" onChangeText={setSkillName} value={skillName} />
            <Field label="Skill instructions (markdown)" multiline onChangeText={setSkillTemplate} value={skillTemplate} />
            <Button title={editingId ? 'Update skill' : 'Save skill'} onPress={addSkill} />
            {editingId ? <><View style={{ height: 8 }} /><Button title="Cancel edit" variant="secondary" onPress={() => { setEditingId(null); setSkillName(''); setSkillTemplate(''); }} /></> : null}
            {skills.length === 0 && <Card><Text style={styles.sub}>No skills yet. Save one above, or install one from GitHub.</Text></Card>}
            {skills.map((s) => (
              <Pressable key={s.id} onPress={() => setDetail(s)}>
                <Card>
                  <Text style={styles.bold}>{s.name} ({s.source})</Text>
                  <Text style={styles.sub} numberOfLines={2}>{s.template}</Text>
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
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  bodyText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 22, marginBottom: tokens.space.md },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
