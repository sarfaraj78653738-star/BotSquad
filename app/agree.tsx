import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field } from '../src/components/ui';
import { ageFromDob, setAgreement } from '../src/lib/agreement';
import { getGoogleUser, signOutGoogle } from '../src/lib/googleAuth';
import { useTokens } from '../src/lib/tokens';

// First-run gate (user order 2026-10-31): a signed-in user who has
// not yet agreed sees only this screen (and /legal). Age is checked
// from a birthdate the user types; the birthdate itself is never
// stored — only the fact of verification. Decline signs out.
// Auto-format the typed birthdate as DD/MM/YYYY: digits only, a "/"
// after the day and after the month (user order 2026-11-01 — typing
// 09092003 showed no slashes). The birthdate is still never stored;
// this only formats the typed text. ageFromDob already parses the
// slashed form.
function formatDob(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export default function AgreeScreen() {
  const tokens = useTokens();
  const router = useRouter();
  const styles = getStyles(tokens);
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function agree() {
    const age = ageFromDob(dob);
    if (age === null) { setError('Enter a valid date of birth (DD/MM/YYYY).'); return; }
    if (age < 18) { setError('BotSquad is for users aged 18 and over. You cannot continue.'); return; }
    setBusy(true);
    setError('');
    try {
      const user = await getGoogleUser().catch(() => null);
      if (!user) {
        await signOutGoogle().catch(() => {});
        router.replace('/login');
        return;
      }
      await setAgreement(user.sub);
      router.replace('/');
    } finally {
      setBusy(false);
    }
  }

  async function decline() {
    await signOutGoogle().catch(() => {});
    router.replace('/login');
  }

  return (
    <View style={styles.wrap}>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.title}>Before you start</Text>
        <Text style={styles.sub}>BotSquad is for users aged 18 and over. Confirm your age and agree to the terms to continue.</Text>
        <Card>
          <Field label="Date of birth" value={dob} onChangeText={(t) => { setDob(formatDob(t)); setError(''); }} placeholder="DD/MM/YYYY" />
          <Text style={styles.note}>Your birthdate is only used to check your age and is not stored.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}
          <View style={{ height: 12 }} />
          <Button title={busy ? 'Please wait…' : 'I am 18 or older — I Agree'} onPress={() => { void agree(); }} disabled={busy} />
          <View style={{ height: 8 }} />
          <Button title="Decline" variant="secondary" onPress={() => { void decline(); }} disabled={busy} />
        </Card>
        <Pressable onPress={() => router.push('/legal')}>
          <Text style={styles.link}>Read the Terms of Use and Privacy Policy</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  wrap: { backgroundColor: tokens.bg, flex: 1 },
  body: { flex: 1, padding: tokens.space.md },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, lineHeight: 22, marginBottom: tokens.space.md },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 8 },
  error: { color: tokens.danger, fontSize: tokens.font.md, marginTop: 8 },
  link: { color: tokens.accent, fontSize: tokens.font.md, fontWeight: '700', marginTop: tokens.space.md, textAlign: 'center' },
});
