import { createContext, useContext, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { tokens } from '../lib/tokens';

// The app's only navigation control: a slide-over drawer opened from the
// hamburger button in each main screen's header. The drawer contains
// exactly five items, in this order, with Settings pinned at the bottom.
// Connections, Routines and Browser are NOT drawer items — they live
// under Settings.
type DrawerItem = { label: string; icon: React.ComponentProps<typeof Feather>['name']; route: string };

const ITEMS: DrawerItem[] = [
  { label: 'Main Chat', icon: 'message-square', route: '/' },
  { label: 'Bots', icon: 'users', route: '/bots' },
  { label: 'Group', icon: 'message-circle', route: '/group' },
  { label: 'History', icon: 'archive', route: '/history' },
];

const SETTINGS_ITEM: DrawerItem = { label: 'Settings', icon: 'settings', route: '/settings' };

const DrawerContext = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });

export function useDrawer() {
  return useContext(DrawerContext);
}

export function MenuButton() {
  const { open } = useDrawer();
  return (
    <Pressable accessibilityLabel="Open menu" accessibilityRole="button" onPress={open} style={styles.menuButton}>
      <Feather name="menu" size={22} color={tokens.text} />
    </Pressable>
  );
}

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <DrawerContext.Provider value={{ open: () => setVisible(true), close: () => setVisible(false) }}>
      {children}
      {visible ? <DrawerMenu onClose={() => setVisible(false)} /> : null}
    </DrawerContext.Provider>
  );
}

function DrawerMenu({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const pathname = usePathname();

  function go(route: string) {
    onClose();
    if (pathname !== route) router.push(route as never);
  }

  function renderItem(item: DrawerItem) {
    const active = pathname === item.route;
    return (
      <Pressable key={item.route} onPress={() => go(item.route)} style={[styles.item, active && styles.itemActive]}>
        <Feather name={item.icon} size={20} color={active ? tokens.text : tokens.textMuted} />
        <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.label}</Text>
      </Pressable>
    );
  }

  return (
    <View style={styles.overlay}>
      <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={onClose} />
      <View style={styles.panel}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>TeamBots</Text>
          <Pressable accessibilityLabel="Close menu" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={20} color={tokens.text} />
          </Pressable>
        </View>
        {ITEMS.map(renderItem)}
        <View style={{ flex: 1 }} />
        <View style={styles.divider} />
        {renderItem(SETTINGS_ITEM)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(33, 29, 24, 0.4)', flex: 1 },
  closeButton: { padding: 6 },
  divider: { backgroundColor: tokens.border, height: 1, marginVertical: 8 },
  item: { alignItems: 'center', borderRadius: tokens.radius.md, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 13 },
  itemActive: { backgroundColor: tokens.accentSoft },
  itemText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  itemTextActive: { color: tokens.text, fontWeight: '700' },
  menuButton: { padding: 6 },
  overlay: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 100 },
  panel: { backgroundColor: tokens.bg, borderRightColor: tokens.border, borderRightWidth: 1, padding: tokens.space.md, width: 300 },
  panelHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: tokens.space.md },
  panelTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
});
