import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { getDb } from '../src/lib/db';
import { BOT_TEMPLATES, nowIso, newId } from '../src/lib/types';
import { listBots, saveBot } from '../src/lib/db';
import { DrawerProvider } from '../src/components/Drawer';
import { ThemeProvider, useTokens } from '../src/lib/tokens';

// Status bar follows the effective theme: light icons on the dark
// palette, dark icons on the light palette.
function ThemedStatusBar() {
  const tokens = useTokens();
  return <StatusBar style={tokens.dark ? 'light' : 'dark'} />;
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
    <ThemeProvider>
      <ThemedStatusBar />
      <DrawerProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </DrawerProvider>
    </ThemeProvider>
  );
}
