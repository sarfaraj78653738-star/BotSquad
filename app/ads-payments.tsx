import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Card } from '../src/components/ui';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

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
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>{t(language, 'settings')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t(language, 'adsPayments')}</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>{t(language, 'currentPlan')}</Text>
        <Card>
          <Text style={styles.bold}>{t(language, 'freePlan')}</Text>
          <Text style={styles.sub}>{t(language, 'noAdsNote')}</Text>
        </Card>
        <Text style={styles.sectionTitle}>{t(language, 'premiumShort')}</Text>
        <Card>
          <Text style={styles.bold}>{t(language, 'premiumTitle')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumA')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumB')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumC')}</Text>
        </Card>
        <Text style={styles.note}>{t(language, 'buyingNote')}</Text>
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
