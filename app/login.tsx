import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BotAvatar } from '../src/components/BotAvatar';
import { AVATAR_VARIANTS } from '../src/lib/avatars';
import { getGoogleUser, GoogleUser, nativeSignIn, signOutGoogle } from '../src/lib/googleAuth';
import { getSetting, setSetting } from '../src/lib/db';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Login screen (user order 2026-10-29):
// exactly ONE option — Continue with Google — and nothing else. No
// email field, no OR divider. Top: the app name. Middle: the logo
// with one short line under it. Bottom: the Google button, then the
// legal line (Terms / Privacy open the Legal section). Login is via
// Google Console only. Since 2026-10-31 it is the FIRST-RUN gate,
// not optional: a new user sees this screen before anything else,
// and once signed in, the gate never shows it again (sign out from
// Settings to see it again).
// Sign-in is NATIVE (switched 2026-10-31): Google's account picker
// opens in the app via Play Services — no browser, no redirect, no
// client-ID paste. The old browser/PKCE flow was abandoned after
// four builds failed to return from the browser to the app.
// Since 2026-11-01 (user order): a terms checkbox gates the Google
// button — it stays disabled until the user checks "I agree to the
// Terms of Use and Privacy Policy". The legal line below the button
// is worded according to the checkbox (not the old "by continuing"
// implication).
const SUNNY = AVATAR_VARIANTS.find((v) => v.id === 'sunny') ?? AVATAR_VARIANTS[0];

export default function LoginScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  useEffect(() => {
    (async () => {
      setUser(await getGoogleUser());
    })().catch(() => {});
  }, []);

  async function signIn() {
    if (!agreed) return; // checkbox gate: no sign-in before agreement
    setMsg('');
    setBusy(true);
    try {
      const u = await nativeSignIn();
      if (!u) return; // user backed out of the account picker
      setUser(u);
      setMsg('');
      // Fill the Profile screen from the Google account (user order
      // 2026-10-31): only fields the user has not already filled,
      // so later manual edits are never overwritten. Then open
      // Main Chat — the launch gate keeps logged-in users out of
      // this screen from now on.
      try {
        const [savedName, savedCall, savedPhoto] = await Promise.all([
          getSetting('profile_full_name'),
          getSetting('profile_call_name'),
          getSetting('profile_photo_uri'),
        ]);
        if (!savedName && u.name) await setSetting('profile_full_name', u.name);
        if (!savedCall && u.name) await setSetting('profile_call_name', u.name.split(' ')[0] ?? u.name);
        if (!savedPhoto && u.picture) await setSetting('profile_photo_uri', u.picture);
      } catch { /* profile fill is best-effort */ }
      router.replace('/');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : t(language, 'signInFailed'));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await signOutGoogle();
    setUser(null);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {user ? (
          <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
            <Feather name="chevron-left" size={22} color={tokens.text} />
          </Pressable>
        ) : (
          <View style={{ width: 44 }} />
        )}
        <Text style={styles.appName}>BotSquad</Text>
        <View style={{ width: 44 }} />
      </View>

      <View style={styles.middle}>
        <BotAvatar variant={SUNNY} size={120} />
        <Text style={styles.tagline}>{t(language, 'tagline')}</Text>
      </View>

      <View style={styles.bottom}>
        {user ? (
          <>
            <Text style={styles.signedIn}>{t(language, 'signedInAs')} {user.name}</Text>
            <Text style={styles.signedInSub}>{user.email}</Text>
            <Pressable onPress={() => { void signOut(); }} style={styles.googleButton}>
              <Text style={styles.googleButtonText}>{t(language, 'signOut')}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Pressable onPress={() => { void signIn(); }} disabled={busy || !agreed} style={[styles.googleButton, (busy || !agreed) && styles.disabledButton]}>
              <View style={styles.gMark}><Text style={styles.gLetter}>G</Text></View>
              <Text style={styles.googleButtonText}>{busy ? t(language, 'signingIn') : t(language, 'continueGoogle')}</Text>
            </Pressable>
            <Pressable onPress={() => setAgreed(!agreed)} disabled={busy} accessibilityRole="checkbox" accessibilityState={{ checked: agreed }} accessibilityLabel="Agree to Terms of Use and Privacy Policy" style={styles.checkboxRow}>
              <View style={[styles.checkboxBox, agreed && styles.checkboxChecked]}>
                {agreed ? <Feather name="check" size={16} color={tokens.onAccent} /> : null}
              </View>
              <Text style={styles.checkboxText}>
                {t(language, 'agreeCheckboxPrefix')}{' '}
                <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } } as never)}>{t(language, 'legalTerms')}</Text>
                {' '}{t(language, 'andWord')}{' '}
                <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } } as never)}>{t(language, 'legalPrivacy')}</Text>
              </Text>
            </Pressable>
            <Text style={styles.legal}>
              {t(language, 'agreeCheckedPrefix')}{' '}
              <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } } as never)}>{t(language, 'legalTerms')}</Text>
              {' '}{t(language, 'andWord')}{' '}
              <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } } as never)}>{t(language, 'legalPrivacy')}</Text>{t(language, 'agreeSuffix')}
            </Text>
          </>
        )}
        {msg ? <Text style={styles.msgText}>{msg}</Text> : null}
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  wrap: { backgroundColor: tokens.bg, flex: 1 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  backRow: { paddingVertical: 6, width: 44 },
  appName: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  middle: { alignItems: 'center', flex: 1, gap: 16, justifyContent: 'center', paddingHorizontal: 32 },
  tagline: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '700', textAlign: 'center' },
  bottom: { gap: 12, padding: tokens.space.md, paddingBottom: 24 },
  googleButton: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: tokens.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'center', paddingVertical: 14 },
  disabledButton: { opacity: 0.5 },
  checkboxRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10, paddingVertical: 10 },
  checkboxBox: { alignItems: 'center', borderColor: tokens.border, borderRadius: 8, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkboxChecked: { backgroundColor: tokens.accent, borderColor: tokens.accent },
  checkboxText: { color: tokens.text, flex: 1, fontSize: tokens.font.md },
  gMark: { alignItems: 'center', borderColor: '#1E1A16', borderRadius: 999, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  gLetter: { color: '#1E1A16', fontSize: 16, fontWeight: '800' },
  googleButtonText: { color: '#1E1A16', fontSize: tokens.font.md, fontWeight: '700' },
  signedIn: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700', textAlign: 'center' },
  signedInSub: { color: tokens.textMuted, fontSize: tokens.font.md, textAlign: 'center' },
  msgText: { color: tokens.danger, fontSize: tokens.font.md, textAlign: 'center' },
  legal: { color: tokens.textMuted, fontSize: tokens.font.sm, textAlign: 'center' },
  legalLink: { color: tokens.text, textDecorationLine: 'underline' },
});
