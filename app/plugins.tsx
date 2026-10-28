import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '../src/components/ui';
import { listPlugins } from '../src/lib/db';
import { Plugin } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

export default function PluginsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [plugins, setPlugins] = useState<Plugin[]>([]);

  const refresh = useCallback(() => {
    listPlugins().then(setPlugins).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Plugins</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.sub}>Plugins are definitions only. No code is executed.</Text>
      {plugins.length === 0 && <Text style={styles.sub}>No plugins installed yet. Install one from GitHub.</Text>}
      {plugins.map((p) => (
        <Card key={p.id}>
          <Text style={styles.bold}>{p.name}</Text>
          <Text style={styles.sub}>{p.description}</Text>
          <Text style={styles.sub}>Author: {p.author}, Permissions: {p.permissions}</Text>
          {p.hasExecutableCode ? <Text style={{ color: tokens.warning }}>Warning: this repo contains executable code. It was NOT executed — only its skill/instruction parts were installed.</Text> : null}
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
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
