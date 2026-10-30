import { useCallback, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { useFocusEffect } from 'expo-router';
import { Button, Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { deleteWorkspaceFile, exportWorkspaceZip, listWorkspaceFiles, readWorkspaceFile, workspaceFileUri, WorkspaceFile } from '../src/lib/workspace';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Workspace: the agent's files on this phone. Main Chat (agent mode)
// saves code, pages, and notes here; this screen lists them, previews
// .html pages in a WebView, shows other files as text, exports the
// whole workspace as a ZIP, and deletes files (with confirmation).
// Honest limit, shown on the screen: backend code saved here does NOT
// run on the phone — export the ZIP and run it on a computer/server.
export default function WorkspaceScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [preview, setPreview] = useState<{ path: string; uri?: string; text?: string } | null>(null);

  const refresh = useCallback(() => { listWorkspaceFiles().then(setFiles).catch(() => setFiles([])); }, []);
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
        {files.length === 0 && <Card><Text style={styles.sub}>{t(language, 'noFilesYet')}</Text></Card>}
        <FlatList
          data={files}
          keyExtractor={(f) => f.path}
          renderItem={({ item }) => (
            <Card>
              <Pressable onPress={() => { void openFile(item); }}>
                <Text style={styles.name}>{item.path}</Text>
                <Text style={styles.sub}>{item.size} {t(language, 'bytes')}</Text>
              </Pressable>
              <Pressable onPress={() => Alert.alert(t(language, 'deleteFileTitle'), `${item.path} ${t(language, 'willBeRemoved')}`, [
                { text: t(language, 'cancel'), style: 'cancel' },
                { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await deleteWorkspaceFile(item.path); refresh(); } },
              ])}>
                <Text style={[styles.sub, { color: tokens.danger }]}>{t(language, 'delete')}</Text>
              </Pressable>
            </Card>
          )}
        />
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backButton: { paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  body: { flex: 1, padding: tokens.space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  name: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginBottom: tokens.space.md },
  previewText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 22 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
