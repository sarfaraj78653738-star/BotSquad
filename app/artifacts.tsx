import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { Artifact, deleteArtifact, listArtifacts } from '../src/lib/projects';
import { useTokens } from '../src/lib/tokens';

// Artifacts — local only, empty by default. This list only ever shows
// items the user explicitly saved from an assistant reply with
// "Save as artifact". No prefilled items, no sample data.
export default function ArtifactsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const [items, setItems] = useState<Artifact[]>([]);

  const refresh = useCallback(async () => { setItems(await listArtifacts().catch(() => [])); }, []);
  useFocusEffect(useCallback(() => { refresh().catch(() => {}); }, [refresh]));

  function confirmDelete(a: Artifact) {
    Alert.alert('Delete this artifact?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteArtifact(a.id); await refresh(); } },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Artifacts</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        {items.length === 0 ? (
          <Text style={styles.sub}>No artifacts yet. Save one from an assistant reply.</Text>
        ) : items.map((a) => (
          <Card key={a.id}>
            <Text style={styles.title}>{a.title}</Text>
            <Text style={styles.bodyText} numberOfLines={6}>{a.body}</Text>
            <Pressable accessibilityLabel={`Delete artifact ${a.title}`} onPress={() => confirmDelete(a)}>
              <Text style={styles.delete}>Delete</Text>
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
