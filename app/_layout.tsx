import { Stack } from 'expo-router';
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
            <Stack screenOptions={{ headerShown: false }} />
          </ThemedSafeArea>
        </DrawerProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
