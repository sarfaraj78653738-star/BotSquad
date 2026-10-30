import { createContext, useContext, useState } from 'react';
import { Pressable, Keyboard, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { newId } from '../lib/types';
import { useLanguage, useTokens } from '../lib/tokens';
import { t } from '../lib/i18n';

// The app's only navigation control: a slide-over drawer opened from the
// hamburger button in each main screen's header. Groups, in order:
// main navigation, History, Projects/Artifacts, then Settings pinned at
// the bottom. A hairline divider (theme border token, visible in both
// light and dark mode) follows EVERY group. Connections and Routines
// are NOT drawer items — they live under Settings.
type DrawerItem = { labelKey: string; icon: React.ComponentProps<typeof Feather>['name']; route: string };

const MAIN_ITEMS: DrawerItem[] = [
  { labelKey: 'mainChat', icon: 'message-square', route: '/' },
  { labelKey: 'bots', icon: 'users', route: '/bots' },
  { labelKey: 'group', icon: 'message-circle', route: '/group' },
];

const HISTORY_ITEMS: DrawerItem[] = [
  { labelKey: 'history', icon: 'archive', route: '/history' },
];

const WORK_ITEMS: DrawerItem[] = [
  { labelKey: 'projects', icon: 'folder', route: '/projects' },
  { labelKey: 'artifacts', icon: 'file-text', route: '/artifacts' },
  { labelKey: 'workspace', icon: 'code', route: '/workspace' },
];

const SETTINGS_ITEM: DrawerItem = { labelKey: 'settings', icon: 'settings', route: '/settings' };

const DrawerContext = createContext<{ open: () => void; close: () => void }>({ open: () => {}, close: () => {} });

export function useDrawer() {
  return useContext(DrawerContext);
}

export function MenuButton() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const { open } = useDrawer();
  return (
    <Pressable accessibilityLabel="Open menu" accessibilityRole="button" onPress={open} style={styles.menuButton}>
      <Feather name="menu" size={22} color={tokens.text} />
    </Pressable>
  );
}

export function DrawerProvider({ children }: { children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  // Opening the drawer dismisses the keyboard (user order 2026-10-30):
  // the chat composer keeps focus otherwise, so the keyboard used to
  // sit open underneath the drawer.
  return (
    <DrawerContext.Provider value={{ open: () => { Keyboard.dismiss(); setVisible(true); }, close: () => setVisible(false) }}>
      {children}
      {visible ? <DrawerMenu onClose={() => setVisible(false)} /> : null}
    </DrawerContext.Provider>
  );
}

function DrawerMenu({ onClose }: { onClose: () => void }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const [language] = useLanguage();

  function go(route: string) {
    Keyboard.dismiss();
    onClose();
    if (pathname !== route) router.push(route as never);
  }

  function renderItem(item: DrawerItem) {
    const active = pathname === item.route;
    return (
      <Pressable key={item.route} onPress={() => go(item.route)} style={[styles.item, active && styles.itemActive]}>
        <Feather name={item.icon} size={20} color={active ? tokens.text : tokens.textMuted} />
        <Text style={[styles.itemText, active && styles.itemTextActive]}>{t(language, item.labelKey)}</Text>
      </Pressable>
    );
  }

  // Panel first, anchored LEFT; the backdrop follows it and dismisses
  // the drawer on tap. (Previously the backdrop came first, which put
  // the panel on the right.)
  return (
    <View style={styles.overlay}>
      <View style={[styles.panel, { paddingTop: insets.top + tokens.space.md }]}>
        <View style={styles.panelHead}>
          <Text style={styles.panelTitle}>BotSquad</Text>
          <Pressable accessibilityLabel="Close menu" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={20} color={tokens.text} />
          </Pressable>
        </View>
        {MAIN_ITEMS.map(renderItem)}
        <View style={styles.divider} />
        {HISTORY_ITEMS.map(renderItem)}
        <View style={styles.divider} />
        {WORK_ITEMS.map(renderItem)}
        <View style={styles.divider} />
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityLabel="Start a new chat"
          accessibilityRole="button"
          onPress={() => { onClose(); router.push({ pathname: '/', params: { chatId: `universal-${newId()}` } } as never); }}
          style={styles.newChatButton}
        >
          <Feather name="plus" size={18} color={tokens.onAccent} />
          <Text style={styles.newChatText}>{t(language, 'newChat')}</Text>
        </Pressable>
        {renderItem(SETTINGS_ITEM)}
      </View>
      <Pressable accessibilityLabel="Close menu" style={styles.backdrop} onPress={onClose} />
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backdrop: { backgroundColor: tokens.scrim, flex: 1 },
  closeButton: { padding: 6 },
  divider: { backgroundColor: tokens.border, height: 1, marginVertical: 8 },
  item: { alignItems: 'center', borderRadius: tokens.radius.md, flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingVertical: 13 },
  itemActive: { backgroundColor: tokens.accentSoft },
  itemText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  itemTextActive: { color: tokens.text, fontWeight: '700' },
  menuButton: { padding: 6 },
  newChatButton: { alignItems: 'center', backgroundColor: tokens.accent, borderRadius: tokens.radius.md, flexDirection: 'row', gap: 8, justifyContent: 'center', marginBottom: 8, paddingVertical: 13 },
  newChatText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  overlay: { bottom: 0, flexDirection: 'row', left: 0, position: 'absolute', right: 0, top: 0, zIndex: 100 },
  panel: { backgroundColor: tokens.bg, borderRightColor: tokens.border, borderRightWidth: 1, paddingBottom: tokens.space.md, paddingHorizontal: tokens.space.md, width: 300 },
  panelHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: tokens.space.md },
  panelTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
});
