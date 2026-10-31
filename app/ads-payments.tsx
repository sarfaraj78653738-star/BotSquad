import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import RazorpayCheckout from 'react-native-razorpay';
import { Card } from '../src/components/ui';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';
import { getGoogleUser } from '../src/lib/googleAuth';
import {
  PREMIUM_PRICE_LABEL,
  cancelSubscription,
  checkGrant,
  createSubscription,
  isPremium,
  pollGrant,
  reconcileGrant,
  setPendingSubscription,
  setPremium,
  syncPremiumFromGrant,
} from '../src/lib/premium';

// Ads & payments (user order 2026-10-31): Remove Ads is ₹199/month,
// INR, a Razorpay subscription (UPI + card) via the NATIVE Razorpay
// SDK (react-native-razorpay plugin route, user choice 2026-10-31 —
// better UPI than the old WebView checkout, which is removed).
// Premium is active ONLY WHILE the subscription is active, and ONLY
// after the Cloudflare Worker confirms a webhook-verified subscription
// event — the SDK success callback alone never grants it. A buy button
// that grants premium with no verified payment was deliberately
// removed on 2026-10-28 and must never return. Standing rule: premium
// removes ads ONLY. Cancel ends the subscription IMMEDIATELY (user
// choice 2026-10-31): the cancelled webhook revokes premium at once,
// no refund for the remaining days.
// Until the Razorpay key id + Worker URL are filled in (see
// src/lib/premium.ts), the buy button honestly reports that payments
// are being set up. This version still shows NO ads.
export default function AdsPaymentsScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [premium, setPremiumState] = useState(false);
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    const owned = await isPremium();
    setPremiumState(owned);
    if (!owned) {
      const granted = await syncPremiumFromGrant();
      if (granted) setPremiumState(true);
    }
  }, []);

  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));

  async function buy() {
    if (await isPremium()) {
      setMsg('You already have an active subscription. No new charge.');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      if (await checkGrant()) {
        await setPremium(true);
        setPremiumState(true);
        setMsg('Premium is already active on your account.');
        return;
      }
      const sub = await createSubscription();
      if (sub.alreadyGranted) {
        await setPremium(true);
        setPremiumState(true);
        setMsg('Premium is already active on your account.');
        return;
      }
      const user = await getGoogleUser().catch(() => null);
      // Native Razorpay SDK: opens Razorpay's own checkout UI (with
      // native UPI intent flow). Its success result NEVER grants
      // premium — only the Worker's webhook-verified grant does
      // (pollGrant below). A dismissed/failed checkout takes no money.
      try {
        await RazorpayCheckout.open({
          key: sub.keyId,
          subscription_id: sub.subscriptionId,
          name: 'BotSquad',
          description: 'Remove Ads — ₹199/month',
          prefill: { name: user?.name ?? '', email: user?.email ?? '' },
          theme: { color: '#111111' },
        });
      } catch (e) {
        const desc = (e as { description?: string })?.description;
        setMsg(desc || 'Payment failed. No money was taken.');
        return;
      }
      setVerifying(true);
      setMsg('Verifying subscription...');
      const granted = await pollGrant();
      setVerifying(false);
      if (granted) {
        await setPremium(true);
        await setPendingSubscription(null);
        setPremiumState(true);
        setMsg('Subscription active. Ads removed.');
      } else {
        setMsg('Payment received, verification is still pending. Premium will activate automatically — reopen this screen to check.');
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not start the subscription. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setMsg('');
    try {
      await cancelSubscription();
      setMsg('Subscription cancelled. Ads are back immediately.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not cancel the subscription. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function restore() {
    setBusy(true);
    setMsg('');
    try {
      // Reconcile re-verifies the TRUE subscription status with
      // Razorpay (not just the Worker's stored grant), so a paying
      // user whose webhook was lost still gets premium back.
      const granted = await reconcileGrant();
      setPremiumState(granted);
      setMsg(granted ? 'Subscription restored.' : 'No active subscription found for this account.');
    } finally {
      setBusy(false);
    }
  }

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
          <Text style={styles.bold}>{premium ? 'Premium' : t(language, 'freePlan')}</Text>
          <Text style={styles.sub}>{premium ? 'Ads removed.' : t(language, 'noAdsNote')}</Text>
        </Card>
        <Text style={styles.sectionTitle}>{t(language, 'premiumShort')}</Text>
        <Card>
          <Text style={styles.bold}>{t(language, 'premiumTitle')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumA')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumB')}</Text>
          <Text style={styles.sub}>• {t(language, 'premiumC')}</Text>
          <Text style={styles.price}>Remove Ads — {PREMIUM_PRICE_LABEL}/month</Text>
          <Text style={styles.sub}>Auto-renews every month (UPI AutoPay or card). Cancel anytime — ads return immediately, no refund for the remaining days.</Text>
          {premium ? (
            <>
              <Text style={styles.sub}>Subscription is active on this device.</Text>
              <Pressable accessibilityLabel="Cancel subscription" onPress={cancel} disabled={busy || verifying} style={[styles.restoreButton, (busy || verifying) && styles.disabled]}>
                <Text style={styles.restoreText}>Cancel subscription</Text>
              </Pressable>
            </>
          ) : (
            <Pressable accessibilityLabel="Subscribe to Remove Ads" onPress={buy} disabled={busy || verifying} style={[styles.buyButton, (busy || verifying) && styles.disabled]}>
              <Text style={styles.buyText}>{verifying ? 'Verifying...' : `Subscribe — ${PREMIUM_PRICE_LABEL}/month`}</Text>
            </Pressable>
          )}
          <Pressable accessibilityLabel="Restore subscription" onPress={restore} disabled={busy || verifying} style={[styles.restoreButton, (busy || verifying) && styles.disabled]}>
            <Text style={styles.restoreText}>Restore subscription</Text>
          </Pressable>
          {msg ? <Text style={styles.msg}>{msg}</Text> : null}
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
  buyButton: { alignItems: 'center', backgroundColor: tokens.accent, borderRadius: tokens.radius.md, marginTop: 8, paddingVertical: 12 },
  buyText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '800' },
  disabled: { opacity: 0.5 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  msg: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 8 },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.md },
  price: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700', marginBottom: 4, marginTop: 4 },
  restoreButton: { alignItems: 'center', borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginTop: 8, paddingVertical: 10 },
  restoreText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
