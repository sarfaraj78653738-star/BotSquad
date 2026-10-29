import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button } from '../src/components/ui';
import { LEGAL_DOCS, LegalDoc } from '../src/lib/legalDocs';
import { useTokens } from '../src/lib/tokens';

// Legal section (user order 2026-10-29): everything legal lives here,
// not as a wall of text on the Settings page — Privacy, Terms, Ads,
// Refunds, Cookies, Data & Deletion, and Report & Feedback. The
// review note at the top is deliberate: these are plain-language
// policies for the GitHub version, not a lawyer's review.
export default function LegalScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const params = useLocalSearchParams();
  const initialDoc = typeof params.doc === 'string' ? LEGAL_DOCS.find((d) => d.id === params.doc) ?? null : null;
  const [doc, setDoc] = useState<LegalDoc | null>(initialDoc);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Legal</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        {doc ? (
          <>
            <Pressable onPress={() => setDoc(null)} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>Legal</Text>
            </Pressable>
            <Text style={styles.title}>{doc.title}</Text>
            <Text style={styles.bodyText}>{doc.body}</Text>
            {doc.action ? <Button title={doc.action.label} onPress={() => { void Linking.openURL(doc.action!.url); }} /> : null}
          </>
        ) : (
          <>
            <Text style={styles.sub}>Plain-language policies for the GitHub version. Before any store release, have them reviewed by a lawyer.</Text>
            {LEGAL_DOCS.map((d) => (
              <Pressable key={d.id} onPress={() => setDoc(d)} style={styles.row}>
                <Text style={styles.rowTitle}>{d.title}</Text>
                <Feather name="chevron-right" size={20} color={tokens.textMuted} />
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
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  row: { alignItems: 'center', borderColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14 },
  rowTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.md },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
