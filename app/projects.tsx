import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Button, Card, Field } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { createProject, deleteProject, listProjectChats, listProjects, Project, ProjectChatLink } from '../src/lib/projects';
import { useTokens } from '../src/lib/tokens';

// Projects — local only, starts empty. Create (name + optional
// description), list, delete. Opening a project shows its name and
// description and notes that chats can be linked later; no linked
// chats are invented, because none exist yet.
export default function ProjectsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [linked, setLinked] = useState<ProjectChatLink[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Project | null>(null);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => { setProjects(await listProjects().catch(() => [])); }, []);
  useFocusEffect(useCallback(() => { refresh().catch(() => {}); }, [refresh]));
  useFocusEffect(useCallback(() => {
    if (selected) listProjectChats(selected.id).then(setLinked).catch(() => setLinked([]));
    else setLinked([]);
  }, [selected]));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) { setMsg('Enter a project name.'); return; }
    await createProject(trimmed, description.trim());
    setName(''); setDescription(''); setMsg('Project created.');
    await refresh();
  }

  function confirmDelete(p: Project) {
    Alert.alert('Delete this project?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteProject(p.id); if (selected?.id === p.id) setSelected(null); await refresh(); } },
    ]);
  }

  if (selected) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to projects" onPress={() => setSelected(null)} style={styles.backRow}>
            <Feather name="chevron-left" size={22} color={tokens.text} />
            <Text style={styles.backText}>Projects</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{selected.name}</Text>
          <View style={{ width: 84 }} />
        </View>
        <ScrollView style={styles.body}>
          {selected.description ? <Text style={styles.bodyText}>{selected.description}</Text> : null}
          <Text style={styles.sub}>Linked chats — added from a chat's menu (Add to project).</Text>
          {linked.length === 0 ? (
            <Text style={styles.sub}>No chats linked yet.</Text>
          ) : linked.map((l) => (
            <Card key={`${l.kind}-${l.chatId}`}>
              <Pressable onPress={() => {
                if (l.kind === 'main') router.push({ pathname: '/', params: { chatId: l.chatId } } as never);
                else if (l.kind === 'bot') router.push(`/chat/${l.chatId}` as never);
                else router.push({ pathname: '/group', params: { threadId: l.chatId } } as never);
              }}>
                <Text style={styles.name}>{l.title}</Text>
                <Text style={styles.sub}>{l.kind === 'main' ? 'Main Chat' : l.kind === 'bot' ? 'Bot chat' : 'Group chat'}</Text>
              </Pressable>
            </Card>
          ))}
          <Button title="Delete project" variant="danger" onPress={() => confirmDelete(selected)} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Projects</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        <Card>
          <Field label="Project name" onChangeText={setName} value={name} />
          <Field label="Description (optional)" multiline onChangeText={setDescription} value={description} />
          <Button title="Create project" onPress={create} />
        </Card>
        {msg ? <Text style={styles.sub}>{msg}</Text> : null}
        {projects.length === 0 ? (
          <Text style={styles.sub}>No projects yet.</Text>
        ) : projects.map((p) => (
          <Card key={p.id}>
            <Pressable onPress={() => setSelected(p)}>
              <Text style={styles.name}>{p.name}</Text>
              {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
            </Pressable>
            <Pressable accessibilityLabel={`Delete project ${p.name}`} onPress={() => confirmDelete(p)}>
              <Text style={styles.delete}>Delete</Text>
            </Pressable>
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
  bodyText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24, marginBottom: tokens.space.sm },
  delete: { color: tokens.danger, fontSize: tokens.font.md, fontWeight: '700', marginTop: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
