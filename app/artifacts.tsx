import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '../src/components/ui';
import { AlertDialog, type AlertDialogButton } from '../src/components/AlertDialog';
import { MenuButton } from '../src/components/Drawer';
import { Artifact, deleteArtifact, listArtifacts } from '../src/lib/projects';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Artifacts — local only, empty by default. This list only ever shows
// items the user explicitly saved from an assistant reply with
// "Save as artifact". No prefilled items, no sample data.
export default function ArtifactsScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const [items, setItems] = useState<Artifact[]>([]);
  const [dialog, setDialog] = useState<{ title: string; message?: string; buttons: AlertDialogButton[] } | null>(null);

  const refresh = useCallback(async () => { setItems(await listArtifacts().catch(() => [])); }, []);
  useFocusEffect(useCallback(() => { refresh().catch(() => {}); }, [refresh]));

  function confirmDelete(a: Artifact) {
    // Themed dialog, not Alert.alert: the system dialog ignored the
    // app's dark mode and showed up white (bug 2026-10-30).
    setDialog({
      title: t(language, 'deleteArtifactTitle'),
      message: t(language, 'cannotUndo'),
      buttons: [
        { text: t(language, 'cancel'), style: 'cancel' },
        { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await deleteArtifact(a.id); await refresh(); } },
      ],
    });
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
        <Text style={styles.headerTitle}>{t(language, 'artifacts')}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        {items.length === 0 ? (
          <Text style={styles.sub}>{t(language, 'noArtifactsYet')}</Text>
        ) : items.map((a) => (
          <Card key={a.id}>
            <Text style={styles.title}>{a.title}</Text>
            <Text style={styles.bodyText} numberOfLines={6}>{a.body}</Text>
            <Pressable accessibilityLabel={`Delete artifact ${a.title}`} onPress={() => confirmDelete(a)}>
              <Text style={styles.delete}>{t(language, 'delete')}</Text>
            </Pressable>
          </Card>
        ))}
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  body: { flex: 1, padding: tokens.space.md },
  bodyText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  delete: { color: tokens.danger, fontSize: tokens.font.md, fontWeight: '700', marginTop: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700', marginBottom: 4 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
