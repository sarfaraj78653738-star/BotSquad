import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Button, Card, Field } from '../src/components/ui';
import { AlertDialog, type AlertDialogButton } from '../src/components/AlertDialog';
import { MenuButton } from '../src/components/Drawer';
import { createProject, deleteProject, getPinnedProjects, listProjectChats, listProjects, Project, ProjectChatLink, togglePinProject } from '../src/lib/projects';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Projects — local only, starts empty. Create (name + optional
// description), list, delete. Opening a project shows its name and
// description and notes that chats can be linked later; no linked
// chats are invented, because none exist yet.
export default function ProjectsScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [linked, setLinked] = useState<ProjectChatLink[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Project | null>(null);
  const [msg, setMsg] = useState('');
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [dialog, setDialog] = useState<{ title: string; message?: string; buttons: AlertDialogButton[] } | null>(null);

  const refresh = useCallback(async () => { setProjects(await listProjects().catch(() => [])); setPinnedIds(await getPinnedProjects().catch(() => [])); }, []);
  useFocusEffect(useCallback(() => { refresh().catch(() => {}); }, [refresh]));
  useFocusEffect(useCallback(() => {
    if (selected) listProjectChats(selected.id).then(setLinked).catch(() => setLinked([]));
    else setLinked([]);
  }, [selected]));

  async function create() {
    const trimmed = name.trim();
    if (!trimmed) { setMsg(t(language, 'enterProjectName')); return; }
    await createProject(trimmed, description.trim());
    setName(''); setDescription(''); setMsg(t(language, 'projectCreated'));
    await refresh();
  }

  function confirmDelete(p: Project) {
    // Themed dialog, not Alert.alert: the system dialog ignored the
    // app's dark mode and showed up white (bug 2026-10-30).
    setDialog({
      title: t(language, 'deleteProjectTitle'),
      message: t(language, 'cannotUndo'),
      buttons: [
        { text: t(language, 'cancel'), style: 'cancel' },
        { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await deleteProject(p.id); if (selected?.id === p.id) setSelected(null); await refresh(); } },
      ],
    });
  }

  async function togglePin(p: Project) {
    await togglePinProject(p.id);
    await refresh();
  }

  if (selected) {
    return (
      <View style={styles.wrap}>
        <AlertDialog
          visible={dialog !== null}
          title={dialog?.title ?? ''}
          message={dialog?.message}
          buttons={dialog?.buttons ?? []}
          onDismiss={() => setDialog(null)}
        />
        <View style={styles.header}>
          <Pressable accessibilityLabel="Back to projects" onPress={() => setSelected(null)} style={styles.backRow}>
            <Feather name="chevron-left" size={22} color={tokens.text} />
            <Text style={styles.backText}>{t(language, 'projects')}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>{selected.name}</Text>
          <View style={{ width: 84 }} />
        </View>
        <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
          {selected.description ? <Text style={styles.bodyText}>{selected.description}</Text> : null}
          <Text style={styles.sub}>{t(language, 'linkedChats')}</Text>
          {linked.length === 0 ? (
            <Text style={styles.sub}>{t(language, 'noChatsLinked')}</Text>
          ) : linked.map((l) => (
            <Card key={`${l.kind}-${l.chatId}`}>
              <Pressable onPress={() => {
                if (l.kind === 'main') router.push({ pathname: '/', params: { chatId: l.chatId } } as never);
                else if (l.kind === 'bot') router.push(`/chat/${l.chatId}` as never);
                else router.push({ pathname: '/group', params: { threadId: l.chatId } } as never);
              }}>
                <Text style={styles.name}>{l.title}</Text>
                <Text style={styles.sub}>{l.kind === 'main' ? t(language, 'mainChat') : l.kind === 'bot' ? t(language, 'botChatKind') : t(language, 'groupChatKind')}</Text>
              </Pressable>
            </Card>
          ))}
          <Button title={pinnedIds.includes(selected.id) ? 'Unpin project' : 'Pin project'} onPress={() => { void togglePin(selected); }} />
          <Button title={t(language, 'deleteProject')} variant="danger" onPress={() => confirmDelete(selected)} />
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <AlertDialog
        visible={dialog !== null}
        title={dialog?.title ?? ''}
        message={dialog?.message}
        buttons={dialog?.buttons ?? []}
        onDismiss={() => setDialog(null)}
      />
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>{t(language, 'projects')}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Card>
          <Field label={t(language, 'projectName')} onChangeText={setName} value={name} />
          <Field label={t(language, 'descriptionOptional')} multiline onChangeText={setDescription} value={description} />
          <Button title={t(language, 'createProject')} onPress={create} />
        </Card>
        {msg ? <Text style={styles.sub}>{msg}</Text> : null}
        {projects.length === 0 ? (
          <Text style={styles.sub}>{t(language, 'noProjectsYet')}</Text>
        ) : [...projects].sort((a, b) => Number(pinnedIds.includes(b.id)) - Number(pinnedIds.includes(a.id))).map((p) => (
          <Card key={p.id}>
            <Pressable onPress={() => setSelected(p)}>
              <Text style={styles.name}>{p.name}</Text>
              {p.description ? <Text style={styles.sub}>{p.description}</Text> : null}
            </Pressable>
            <View style={styles.rowActions}>
              <Pressable accessibilityLabel={`${pinnedIds.includes(p.id) ? 'Unpin' : 'Pin'} project ${p.name}`} onPress={() => { void togglePin(p); }}>
                <Text style={styles.pin}>{pinnedIds.includes(p.id) ? 'Unpin' : 'Pin'}</Text>
              </Pressable>
              <Pressable accessibilityLabel={`Delete project ${p.name}`} onPress={() => confirmDelete(p)}>
                <Text style={styles.delete}>{t(language, 'delete')}</Text>
              </Pressable>
            </View>
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
  pin: { color: tokens.accent, fontSize: tokens.font.md, fontWeight: '700', marginTop: 8 },
  rowActions: { flexDirection: 'row', gap: 20 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
