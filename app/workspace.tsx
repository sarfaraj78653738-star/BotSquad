import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from 'expo-router';
import { Button, Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { deleteWorkspaceFile, exportWorkspaceZip, listWorkspaceFiles, readWorkspaceFile, workspaceFileUri, WorkspaceFile } from '../src/lib/workspace';
import { listBots, listGroupThreads } from '../src/lib/db';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Workspace: the agent's files on this phone. Main Chat (agent mode)
// saves code, pages, and notes here; this screen lists them, previews
// .html pages in a WebView, shows other files as text, exports the
// whole workspace as a ZIP, and deletes files (with confirmation).
// Sections mirror History (user order 2026-10-30): Main Chat, Bots,
// Groups — so a bot's or group's files never mix with Main Chat's.
// Main Chat files live at the workspace root; bot files under
// "bots/<botId>/", group files under "groups/<threadId>/" (the agent
// loop confines each chat to its own section, so no confusion).
// Honest limit, shown on the screen: backend code saved here does NOT
// run on the phone — export the ZIP and run it on a computer/server.
type Row = { kind: 'file'; file: WorkspaceFile; label: string } | { kind: 'subhead'; label: string } | { kind: 'empty' };
type Tab = 'main' | 'bots' | 'group';
export default function WorkspaceScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [botNames, setBotNames] = useState<Map<string, string>>(new Map());
  const [groupTitles, setGroupTitles] = useState<Map<string, string>>(new Map());
  const [preview, setPreview] = useState<{ path: string; uri?: string; text?: string } | null>(null);
  const [tab, setTab] = useState<Tab>('main');

  const refresh = useCallback(() => {
    listWorkspaceFiles().then(setFiles).catch(() => setFiles([]));
    listBots().then((b) => setBotNames(new Map(b.map((x) => [x.id, x.name])))).catch(() => {});
    listGroupThreads().then((g) => setGroupTitles(new Map(g.map((x) => [x.id, x.title])))).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  async function openFile(f: WorkspaceFile) {
    if (f.path.endsWith('.html') || f.path.endsWith('.htm')) {
      setPreview({ path: f.path, uri: await workspaceFileUri(f.path) });
    } else {
      try { setPreview({ path: f.path, text: await readWorkspaceFile(f.path) }); }
      catch { Alert.alert(t(language, 'couldNotOpen'), t(language, 'couldNotRead')); }
    }
  }

  if (preview) {
    return (
      <View style={styles.wrap}>
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle} numberOfLines={1}>{preview.path}</Text>
          <Pressable accessibilityLabel="Back to workspace" onPress={() => setPreview(null)} style={styles.backButton}>
            <Text style={styles.backText}>{t(language, 'filesBack')}</Text>
          </Pressable>
        </View>
        {preview.uri ? (
          <WebView source={{ uri: preview.uri }} javaScriptEnabled allowFileAccess originWhitelist={['*']} style={{ flex: 1 }} />
        ) : (
          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
            <Text style={styles.previewText}>{preview.text}</Text>
          </ScrollView>
        )}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>{t(language, 'workspace')}</Text>
        <View style={{ width: 34 }} />
      </View>
      <View style={styles.body}>
        <Button title={t(language, 'exportWorkspaceZip')} onPress={async () => { try { await exportWorkspaceZip(); } catch { Alert.alert(t(language, 'exportFailed'), t(language, 'zipFailed')); } }} />
        <View style={styles.tabs}>
          {([['main', 'mainChat'], ['bots', 'bots'], ['group', 'group']] as [Tab, string][]).map(([tabKey, labelKey]) => (
            <Pressable key={tabKey} onPress={() => setTab(tabKey)} style={[styles.tab, tab === tabKey && styles.tabActive]}>
              <Text style={[styles.tabText, tab === tabKey && styles.tabTextActive]}>{t(language, labelKey)}</Text>
            </Pressable>
          ))}
        </View>
        <FlatList
          data={buildTabRows(files, botNames, groupTitles)[tab]}
          keyExtractor={(row, i) => (row.kind === 'file' ? row.file.path : `${row.kind}-${i}`)}
          renderItem={({ item }) => {
            if (item.kind === 'subhead') return <Text style={styles.subhead}>{item.label}</Text>;
            if (item.kind === 'empty') return <Card><Text style={styles.sub}>{t(language, 'noFilesYet')}</Text></Card>;
            const f = item.file;
            return (
              <Card>
                <Pressable onPress={() => { void openFile(f); }}>
                  <Text style={styles.name}>{item.label}</Text>
                  <Text style={styles.sub}>{f.size} {t(language, 'bytes')}</Text>
                </Pressable>
                <Pressable onPress={() => Alert.alert(t(language, 'deleteFileTitle'), `${f.path} ${t(language, 'willBeRemoved')}`, [
                  { text: t(language, 'cancel'), style: 'cancel' },
                  { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await deleteWorkspaceFile(f.path); refresh(); } },
                ])}>
                  <Text style={[styles.sub, { color: tokens.danger }]}>{t(language, 'delete')}</Text>
                </Pressable>
              </Card>
            );
          }}
        />
      </View>
    </View>
  );
}

function buildTabRows(files: WorkspaceFile[], botNames: Map<string, string>, groupTitles: Map<string, string>): Record<Tab, Row[]> {
  const main: Row[] = [];
  const botGroups = new Map<string, WorkspaceFile[]>();
  const groupGroups = new Map<string, WorkspaceFile[]>();
  for (const f of files) {
    if (f.path.startsWith('bots/')) {
      const rest = f.path.slice('bots/'.length);
      const id = rest.split('/')[0] ?? '';
      const arr = botGroups.get(id) ?? [];
      arr.push(f);
      botGroups.set(id, arr);
    } else if (f.path.startsWith('groups/')) {
      const rest = f.path.slice('groups/'.length);
      const id = rest.split('/')[0] ?? '';
      const arr = groupGroups.get(id) ?? [];
      arr.push(f);
      groupGroups.set(id, arr);
    } else {
      main.push({ kind: 'file', file: f, label: f.path });
    }
  }
  const botRows: Row[] = [];
  for (const [id, fs] of [...botGroups.entries()].sort((a, b) => (botNames.get(a[0]) ?? a[0]).localeCompare(botNames.get(b[0]) ?? b[0]))) {
    botRows.push({ kind: 'subhead', label: botNames.get(id) ?? `Bot ${id.slice(0, 8)}` });
    for (const f of fs) botRows.push({ kind: 'file', file: f, label: f.path.slice(`bots/${id}/`.length) });
  }
  const groupRows: Row[] = [];
  for (const [id, fs] of [...groupGroups.entries()].sort((a, b) => (groupTitles.get(a[0]) ?? a[0]).localeCompare(groupTitles.get(b[0]) ?? b[0]))) {
    groupRows.push({ kind: 'subhead', label: groupTitles.get(id) ?? `Group ${id.slice(0, 8)}` });
    for (const f of fs) groupRows.push({ kind: 'file', file: f, label: f.path.slice(`groups/${id}/`.length) });
  }
  return {
    main: main.length ? main : [{ kind: 'empty' }],
    bots: botRows.length ? botRows : [{ kind: 'empty' }],
    group: groupRows.length ? groupRows : [{ kind: 'empty' }],
  };
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backButton: { paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  body: { flex: 1, padding: tokens.space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  subhead: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '700', marginTop: tokens.space.sm, marginBottom: 2 },
  tab: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, flex: 1, paddingVertical: 9 },
  tabActive: { backgroundColor: tokens.text },
  tabText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600', textAlign: 'center' },
  tabTextActive: { color: tokens.surface },
  tabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginBottom: tokens.space.md },
  previewText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 22 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
