// Must stay FIRST: fills process.version before any route module
// (or browserify shim) evaluates. See processPolyfill.ts.
import '../src/lib/processPolyfill';
import { Stack, useRootNavigationState, useRouter, useSegments } from 'expo-router';
import { Component } from 'react';
import { Linking, Modal, ScrollView, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../src/lib/db';
import { getGoogleUser } from '../src/lib/googleAuth';
import { BOT_TEMPLATES, nowIso, newId } from '../src/lib/types';
import { listBots, saveBot } from '../src/lib/db';
import { DrawerProvider } from '../src/components/Drawer';
// PluginRunnerHost RESTORED 2026-10-31: launch + login are proven now,
// and the launch crash's cause was the readable-stream shim, not this
// hidden WebView — so run_plugin works again (it failed fast with
// "not ready" while the host was out).
import { PluginRunnerHost } from '../src/components/PluginRunnerHost';
import { ThemeProvider, useTokens } from '../src/lib/tokens';

// Startup error screen (diagnostic, 2026-10-31): if anything in the
// render tree throws during launch, show the error as text instead
// of a bare "keeps stopping" crash, so a screenshot reveals the
// cause. It cannot catch native crashes or bundle-evaluation
// throws (nothing renders then) — those still need a device log.
class StartupErrorBoundary extends Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error): { error: Error } {
    return { error };
  }
  render(): React.ReactNode {
    const e = this.state.error;
    if (e) {
      return (
        <View style={{ flex: 1, padding: 24, justifyContent: 'center', backgroundColor: '#ffffff' }}>
          <ScrollView>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#000000' }}>App failed to start</Text>
            <Text style={{ marginTop: 12, color: '#000000' }}>{String((e as Error).message ?? e)}</Text>
            <Text style={{ marginTop: 12, fontSize: 12, color: '#333333' }}>{String((e as Error).stack ?? '').slice(0, 2000)}</Text>
          </ScrollView>
        </View>
      );
    }
    return this.props.children;
  }
}

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
  const [booted, setBooted] = useState(false);
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
    else setBooted(true);
  }, [auth, checking, segments, router]);
  // Boot gate: a plain overlay View does NOT cover the navigator on
  // Android, so guests saw Main Chat for 1-2s while the session check
  // ran. A Modal renders above the navigator, and it stays up until
  // the visible route already matches the auth state — so the first
  // thing a guest ever sees is the login screen, never Main Chat.
  if (booted) return null;
  return (
    <Modal visible animationType="none" transparent={false}>
      <View style={{ flex: 1, backgroundColor: tokens.bg }} />
    </Modal>
  );
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
    <StartupErrorBoundary>
      <SafeAreaProvider>
        <ThemeProvider>
          <ThemedStatusBar />
          <DrawerProvider>
            <ThemedSafeArea>
              <DeepLinkHandler />
              <AuthGate />
              <Stack screenOptions={{ headerShown: false }} />
              <PluginRunnerHost />
            </ThemedSafeArea>
          </DrawerProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </StartupErrorBoundary>
  );
}
