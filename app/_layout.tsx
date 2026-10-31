import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { Linking, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../src/lib/db';
import { getGoogleUser } from '../src/lib/googleAuth';
import { BOT_TEMPLATES, nowIso, newId } from '../src/lib/types';
import { listBots, saveBot } from '../src/lib/db';
import { DrawerProvider } from '../src/components/Drawer';
import { PluginRunnerHost } from '../src/components/PluginRunnerHost';
import { ThemeProvider, useTokens } from '../src/lib/tokens';

// Status bar follows the effective theme: light icons on the dark
// palette, dark icons on the light palette, so the time and system
// icons stay readable in both modes.
function ThemedStatusBar() {
  const tokens = useTokens();
  return <StatusBar style={tokens.dark ? 'light' : 'dark'} />;
}

// Every screen renders inside this safe area, so headers never overlap
// the phone status bar and composers never sit under the navigation
// bar / gesture area, on any phone size. The app flexes to the
// available height instead of using fixed heights that overflow.
function ThemedSafeArea({ children }: { children: React.ReactNode }) {
  const tokens = useTokens();
  return <SafeAreaView style={{ flex: 1, backgroundColor: tokens.bg }}>{children}</SafeAreaView>;
}

// Deep links from Android home-screen shortcuts ("Add to home"):
// botsquad://open?kind=main&chatId=… | kind=bot&botId=… |
// kind=group&threadId=…. Parsed by hand (no URLSearchParams reliance)
// and routed to the exact thread. Malformed links are ignored.
function DeepLinkHandler() {
  const router = useRouter();
  const navState = useRootNavigationState();
  useEffect(() => {
    if (!navState?.key) return;
    const handle = (url: string | null) => {
      if (!url || !url.startsWith('botsquad://open')) return;
      try {
        const query = url.split('?')[1] ?? '';
        const params: Record<string, string> = {};
        for (const part of query.split('&')) {
          const [k, v] = part.split('=');
          if (k) params[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
        }
        if (params.kind === 'main' && params.chatId) router.push({ pathname: '/', params: { chatId: params.chatId } } as never);
        else if (params.kind === 'bot' && params.botId) router.push(`/chat/${params.botId}` as never);
        else if (params.kind === 'group' && params.threadId) router.push({ pathname: '/group', params: { threadId: params.threadId } } as never);
      } catch { /* ignore malformed links */ }
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, [navState?.key, router]);
  return null;
}

// Launch gate (user order 2026-10-31, supersedes the old
// "login is optional" rule): a new user sees the login screen
// first; once signed in, the login screen never appears again.
// Guests may only be on /login (the gate itself) or /legal
// (Terms/Privacy linked from the login screen); anywhere else
// bounces to /login. Signed-in users on /login bounce to Main
// Chat. Auth is re-checked on every route change, so a sign-in
// or sign-out takes effect immediately instead of bouncing the
// user back on stale state.
function AuthGate() {
  const tokens = useTokens();
  const router = useRouter();
  const segments = useSegments();
  const navState = useRootNavigationState();
  const [auth, setAuth] = useState<'loading' | 'authed' | 'guest'>('loading');
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    if (!navState?.key) return;
    let alive = true;
    setChecking(true);
    getGoogleUser().then((u) => {
      if (!alive) return;
      setAuth(u ? 'authed' : 'guest');
      setChecking(false);
    }).catch(() => {
      if (!alive) return;
      setAuth('guest');
      setChecking(false);
    });
    return () => { alive = false; };
  }, [navState?.key, segments]);
  useEffect(() => {
    if (checking || auth === 'loading') return;
    const seg = segments[0];
    if (auth === 'guest' && seg !== 'login' && seg !== 'legal') router.replace('/login');
    else if (auth === 'authed' && seg === 'login') router.replace('/');
  }, [auth, checking, segments, router]);
  if (auth !== 'loading') return null;
  return <View style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: tokens.bg, zIndex: 10 }} />;
}

export default function RootLayout() {
  useEffect(() => {
    (async () => {
      await getDb();
      const existing = await listBots();
      if (existing.length === 0) {
        for (const t of BOT_TEMPLATES) {
          const now = nowIso();
          await saveBot({ ...t, id: newId(), isPinned: 0, createdAt: now, updatedAt: now });
        }
      }
    })().catch(() => {});
  }, []);
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedStatusBar />
        <DrawerProvider>
          <ThemedSafeArea>
            <DeepLinkHandler />
            <AuthGate />
            <PluginRunnerHost />
            <Stack screenOptions={{ headerShown: false }} />
          </ThemedSafeArea>
        </DrawerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
