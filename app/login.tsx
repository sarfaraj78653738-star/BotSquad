import { useAuthRequest } from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { BotAvatar } from '../src/components/BotAvatar';
import { Button, Card, Field } from '../src/components/ui';
import { AVATAR_VARIANTS } from '../src/lib/avatars';
import { completeGoogleSignIn, getGoogleClientId, getGoogleUser, GOOGLE_DISCOVERY, GOOGLE_REDIRECT_URI, GOOGLE_SCOPES, GoogleUser, setGoogleClientId, signOutGoogle } from '../src/lib/googleAuth';
import { getSetting, setSetting } from '../src/lib/db';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

WebBrowser.maybeCompleteAuthSession();

// Login screen (user order 2026-10-29):
// exactly ONE option — Continue with Google — and nothing else. No
// email field, no OR divider. Top: the app name. Middle: the logo
// with one short line under it. Bottom: the Google button, then the
// legal line (Terms / Privacy open the Legal section). Login is via
// Google Console only (Desktop-type OAuth client, PKCE, no server of
// ours). Since 2026-10-31 it is the FIRST-RUN gate, not optional:
// a new user sees this screen before anything else, and once signed
// in, the gate never shows it again (sign out from Settings to see
// it again).
// The one exception to "nothing else": while no Google Client ID is
// configured yet, a small one-time setup block asks for it (Google
// Cloud Console → Credentials → OAuth client ID → Desktop app). Once
// saved, the screen is exactly the design above: button + legal line.
const SUNNY = AVATAR_VARIANTS.find((v) => v.id === 'sunny') ?? AVATAR_VARIANTS[0];

export default function LoginScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [clientId, setClientId] = useState('');
  const [clientIdLoaded, setClientIdLoaded] = useState(false);
  const [draftClientId, setDraftClientId] = useState('');
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const config = useMemo(() => ({
    clientId: clientId || 'not-configured',
    redirectUri: GOOGLE_REDIRECT_URI,
    scopes: GOOGLE_SCOPES,
    usePKCE: true,
  }), [clientId]);
  const [request, response, promptAsync] = useAuthRequest(config, GOOGLE_DISCOVERY);

  useEffect(() => {
    (async () => {
      setClientId((await getGoogleClientId()) ?? '');
      setUser(await getGoogleUser());
      setClientIdLoaded(true);
    })().catch(() => setClientIdLoaded(true));
  }, []);

  useEffect(() => {
    if (response?.type !== 'success' || !request?.codeVerifier || !clientId) return;
    const code = response.params.code;
    const verifier = request.codeVerifier;
    if (!code || !verifier) return;
    (async () => {
      setBusy(true);
      try {
        const u = await completeGoogleSignIn(code, verifier, clientId);
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
    })();
  }, [response, request, clientId]);

  async function signIn() {
    if (!request || !clientId) return;
    setMsg('');
    try {
      await promptAsync();
    } catch {
      setMsg(t(language, 'couldNotOpenSignIn'));
    }
  }

  async function signOut() {
    await signOutGoogle();
    setUser(null);
  }

  async function saveClientId() {
    const id = draftClientId.trim();
    if (!id) { setMsg(t(language, 'pasteFirst')); return; }
    await setGoogleClientId(id);
    setClientId(id);
    setMsg('');
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
        ) : !clientIdLoaded ? null : clientId ? (
          <Pressable onPress={() => { void signIn(); }} disabled={busy || !request} style={styles.googleButton}>
            <View style={styles.gMark}><Text style={styles.gLetter}>G</Text></View>
            <Text style={styles.googleButtonText}>{busy ? t(language, 'signingIn') : t(language, 'continueGoogle')}</Text>
          </Pressable>
        ) : (
          <Card>
            <Text style={styles.setupTitle}>{t(language, 'setupTitle')}</Text>
            <Text style={styles.setupSub}>{t(language, 'setupSub')}</Text>
            <Field label={t(language, 'googleClientId')} placeholder="123456789-abc.apps.googleusercontent.com" onChangeText={setDraftClientId} value={draftClientId} />
            <Button title={t(language, 'saveClientId')} onPress={() => { void saveClientId(); }} />
          </Card>
        )}
        {msg ? <Text style={styles.msgText}>{msg}</Text> : null}
        <Text style={styles.legal}>
          {t(language, 'agreePrefix')}{' '}
          <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'terms' } } as never)}>{t(language, 'legalTerms')}</Text>
          {' '}{t(language, 'andWord')}{' '}
          <Text style={styles.legalLink} onPress={() => router.push({ pathname: '/legal', params: { doc: 'privacy' } } as never)}>{t(language, 'legalPrivacy')}</Text>{t(language, 'agreeSuffix')}
        </Text>
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
  gMark: { alignItems: 'center', borderColor: '#1E1A16', borderRadius: 14, borderWidth: 1, height: 28, justifyContent: 'center', width: 28 },
  gLetter: { color: '#1E1A16', fontSize: 16, fontWeight: '800' },
  googleButtonText: { color: '#1E1A16', fontSize: tokens.font.md, fontWeight: '700' },
  signedIn: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700', textAlign: 'center' },
  signedInSub: { color: tokens.textMuted, fontSize: tokens.font.md, textAlign: 'center' },
  setupTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  setupSub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  msgText: { color: tokens.danger, fontSize: tokens.font.md, textAlign: 'center' },
  legal: { color: tokens.textMuted, fontSize: tokens.font.sm, textAlign: 'center' },
  legalLink: { color: tokens.text, textDecorationLine: 'underline' },
});
