import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '../src/components/ui';
import { useTokens } from '../src/lib/tokens';

// Ads & payments section (user order 2026-10-29): a separate page
// inside Settings where users will buy Premium to stop ads. The
// honest current state: this GitHub version shows NO ads and takes
// NO payments, so there is no buy button here yet. A buy button that
// grants premium with no verified payment was deliberately removed on
// 2026-10-28 — it would mislead users. The button appears only once
// a real, verified purchase route exists (Play Billing after a Play
// Store listing, or Razorpay with login + server verification).
// Standing rule: premium removes ads ONLY. It never locks a feature.
export default function AdsPaymentsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Ads & payments</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.sectionTitle}>Current plan</Text>
        <Card>
          <Text style={styles.bold}>Free</Text>
          <Text style={styles.sub}>This version shows no ads.</Text>
        </Card>
        <Text style={styles.sectionTitle}>Premium</Text>
        <Card>
          <Text style={styles.bold}>Premium — no ads</Text>
          <Text style={styles.sub}>• Removes ads during loading.</Text>
          <Text style={styles.sub}>• Premium never locks a feature — everything in the app stays free.</Text>
          <Text style={styles.sub}>• Purchase is not live yet: price and payment setup are pending.</Text>
        </Card>
        <Text style={styles.note}>Buying opens once price and a verified payment route are set up. No payment is taken from this page today.</Text>
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
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.md },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
