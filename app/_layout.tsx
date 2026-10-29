import { Stack, useRootNavigationState, useRouter } from 'expo-router';
import { Linking } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { getDb } from '../src/lib/db';
import { BOT_TEMPLATES, nowIso, newId } from '../src/lib/types';
import { listBots, saveBot } from '../src/lib/db';
import { DrawerProvider } from '../src/components/Drawer';
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
// teambots://open?kind=main&chatId=… | kind=bot&botId=… |
// kind=group&threadId=…. Parsed by hand (no URLSearchParams reliance)
// and routed to the exact thread. Malformed links are ignored.
function DeepLinkHandler() {
  const router = useRouter();
  const navState = useRootNavigationState();
  useEffect(() => {
    if (!navState?.key) return;
    const handle = (url: string | null) => {
      if (!url || !url.startsWith('teambots://open')) return;
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
            <Stack screenOptions={{ headerShown: false }} />
          </ThemedSafeArea>
        </DrawerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
