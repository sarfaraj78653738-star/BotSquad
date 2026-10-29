import { useCallback, useState } from 'react';
import { Alert, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
// No ads/payment import in GitHub v1 — see src/lib/ads.ts (ADS_ENABLED = false).
import { ColorMode, FontStyle, useColorMode, useFontStyle, useTokens } from '../src/lib/tokens';

// Settings is the hub, laid out as clean grouped rows (icon, title,
// short subtitle). Group 1 is the person + device: Profile, Color mode,
// Font style, Permissions. Group 2 is the tool pages — Model setup, Connections,
// Skills, Plugins, MCP servers, GitHub install, Routines.
// Nothing stacks all of them on one page. Deliberately NOT here: no
// Sharing section, no Voice section, no Upgrade/Billing, no
// Capabilities toggles (no code execution, no web search toggle, no
// memory-from-chats toggle — TeamBots has none of those), no
// Notifications toggle (no notification system), no Time & focus.
const MENU: { label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }[] = [
  { label: 'Model setup', detail: 'Providers, keys, and saved models', icon: 'cpu', route: '/model-setup' },
  { label: 'Login', detail: 'Google sign-in (optional)', icon: 'user', route: '/login' },
  { label: 'Main Chat avatar', detail: 'Pick Main Chat\'s avatar', icon: 'smile', route: '/main-avatar' },
  { label: 'Connections', detail: 'Add and enable connections', icon: 'layers', route: '/connect' },
  { label: 'Skills', detail: 'Instruction templates', icon: 'zap', route: '/skills' },
  { label: 'Plugins', detail: 'Installed plugin definitions', icon: 'package', route: '/plugins' },
  { label: 'MCP servers', detail: 'HTTP/SSE tool servers', icon: 'server', route: '/mcp' },
  { label: 'GitHub install', detail: 'Install skills, plugins, MCP servers', icon: 'github', route: '/github-install' },
  { label: 'Routines', detail: 'Scheduled skills and routines', icon: 'clock', route: '/routines' },
  { label: 'Legal', detail: 'Privacy, terms, ads, refunds & feedback', icon: 'shield', route: '/legal' },
];

const COLOR_OPTIONS: { id: ColorMode; label: string; detail: string }[] = [
  { id: 'system', label: 'System', detail: 'Follows your phone' },
  { id: 'light', label: 'Light', detail: 'Always light' },
  { id: 'dark', label: 'Dark', detail: 'Always dark' },
];

const FONT_OPTIONS: { id: FontStyle; label: string; detail: string }[] = [
  { id: 'default', label: 'Default', detail: "App's designed sizes" },
  { id: 'system', label: 'System', detail: "Follow your device's text size" },
];

// Small bottom sheet used by the Color mode and Font style rows. Same
// clean pattern as the model picker: title, one row per option with a
// short detail line, checkmark on the current choice.
function OptionSheet({ open, title, options, selected, onSelect, onClose }: {
  open: boolean; title: string;
  options: { id: string; label: string; detail: string }[];
  selected: string; onSelect: (id: string) => void; onClose: () => void;
}) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const insets = useSafeAreaInsets();
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={open}>
      <Pressable accessibilityLabel="Close picker" onPress={onClose} style={styles.backdrop} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle}>{title}</Text>
          <Pressable accessibilityLabel="Close picker" onPress={onClose} style={styles.closeButton}>
            <Feather name="x" size={20} color={tokens.text} />
          </Pressable>
        </View>
        {options.map((o) => (
          <Pressable key={o.id} onPress={() => { onSelect(o.id); onClose(); }} style={styles.sheetRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetRowText, o.id === selected && styles.sheetRowTextActive]}>{o.label}</Text>
              <Text style={styles.sheetRowDetail}>{o.detail}</Text>
            </View>
            {o.id === selected ? <Feather name="check" size={18} color={tokens.text} /> : null}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

export default function SettingsScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [colorMode, setColorMode] = useColorMode();
  const [fontStyle, setFontStyle] = useFontStyle();
  const [picker, setPicker] = useState<'color' | 'font' | null>(null);
  const [permText, setPermText] = useState('Open system settings to review');


  // Permissions row: shows the REAL status of all four, never a
  // claimed one. Camera and Photos status come from the image picker;
  // Microphone and Files from the OS check on Android. Refreshed every
  // time this screen is focused.
  const refreshPermissions = useCallback(async () => {
    try {
      const cam = await ImagePicker.getCameraPermissionsAsync();
      const photos = await ImagePicker.getMediaLibraryPermissionsAsync();
      const label = (s: string) => s === 'granted' ? 'granted' : s === 'denied' ? 'denied' : 'not set';
      let micLabel = 'not asked';
      let filesLabel = 'not asked';
      if (Platform.OS === 'android') {
        micLabel = (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) ? 'granted' : 'not set';
        const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
        const filePerm = api >= 33 ? PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES : PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE;
        filesLabel = (await PermissionsAndroid.check(filePerm)) ? 'granted' : 'not set';
      }
      setPermText(`Mic: ${micLabel} · Camera: ${label(cam.status)} · Photos: ${label(photos.status)} · Files: ${filesLabel}`);
    } catch {
      setPermText('Could not check permissions');
    }
  }, []);
  useFocusEffect(useCallback(() => { refreshPermissions().catch(() => {}); }, [refreshPermissions]));

  // In-app permission flow (user order 2026-10-29): tapping the
  // Permissions row must NOT open the phone's system settings. It
  // asks inside the app, one popup at a time, in this order:
  // Microphone → Camera → Photos → Files. Each popup has Allow and
  // Deny; Allow triggers that permission's real OS request, Deny
  // records denied and moves to the next step. The row's status line
  // updates at the end.
  const runPermissionFlow = useCallback(() => {
    const results: Record<string, string> = {};
    const finish = () => {
      setPermText(`Mic: ${results.mic} · Camera: ${results.camera} · Photos: ${results.photos} · Files: ${results.files}`);
    };
    const requestMic = async (): Promise<string> => {
      if (Platform.OS !== 'android') return 'not asked';
      try {
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
        return r === 'granted' ? 'granted' : 'denied';
      } catch { return 'denied'; }
    };
    const requestFiles = async (): Promise<string> => {
      if (Platform.OS !== 'android') return 'not asked';
      try {
        const api = typeof Platform.Version === 'number' ? Platform.Version : 0;
        if (api >= 33) {
          const r = await PermissionsAndroid.requestMultiple([
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_IMAGES,
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_VIDEO,
            PermissionsAndroid.PERMISSIONS.READ_MEDIA_AUDIO,
          ]);
          return Object.values(r).some((v) => v === 'granted') ? 'granted' : 'denied';
        }
        const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE);
        return r === 'granted' ? 'granted' : 'denied';
      } catch { return 'denied'; }
    };
    const askFiles = () => {
      Alert.alert('Files', 'Allow BotSquad to read files you pick?', [
        { text: 'Deny', style: 'cancel', onPress: () => { results.files = 'denied'; finish(); } },
        { text: 'Allow', onPress: async () => { results.files = await requestFiles(); finish(); } },
      ]);
    };
    const askPhotos = () => {
      Alert.alert('Photos', 'Allow BotSquad to use your photos?', [
        { text: 'Deny', style: 'cancel', onPress: () => { results.photos = 'denied'; askFiles(); } },
        { text: 'Allow', onPress: async () => { try { const r = await ImagePicker.requestMediaLibraryPermissionsAsync(); results.photos = r.status === 'granted' ? 'granted' : 'denied'; } catch { results.photos = 'denied'; } askFiles(); } },
      ]);
    };
    const askCamera = () => {
      Alert.alert('Camera', 'Allow BotSquad to use your camera?', [
        { text: 'Deny', style: 'cancel', onPress: () => { results.camera = 'denied'; askPhotos(); } },
        { text: 'Allow', onPress: async () => { try { const r = await ImagePicker.requestCameraPermissionsAsync(); results.camera = r.status === 'granted' ? 'granted' : 'denied'; } catch { results.camera = 'denied'; } askPhotos(); } },
      ]);
    };
    Alert.alert('Microphone', 'Allow BotSquad to use your microphone for voice input?', [
      { text: 'Deny', style: 'cancel', onPress: () => { results.mic = 'denied'; askCamera(); } },
      { text: 'Allow', onPress: async () => { results.mic = await requestMic(); askCamera(); } },
    ]);
  }, []);


  const colorLabel = COLOR_OPTIONS.find((o) => o.id === colorMode)?.label ?? 'System';
  const fontLabel = FONT_OPTIONS.find((o) => o.id === fontStyle)?.label ?? 'Default';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.sectionTitle}>General</Text>
        <Card>
          <Pressable onPress={() => router.push('/profile' as never)} style={styles.menuRow}>
            <Feather name="user" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Profile</Text>
              <Text style={styles.menuDetail}>Name, photo, and preferences</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => setPicker('color')} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="moon" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Color mode</Text>
              <Text style={styles.menuDetail}>{colorLabel}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => setPicker('font')} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="type" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Font style</Text>
              <Text style={styles.menuDetail}>{fontLabel}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={runPermissionFlow} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="shield" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Permissions</Text>
              <Text style={styles.menuDetail}>{permText}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => router.push('/ads-payments' as never)} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="credit-card" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Ads & payments</Text>
              <Text style={styles.menuDetail}>Plans and premium</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
        </Card>
        <Text style={styles.sectionTitle}>Tools</Text>
        <Card>
          {MENU.map((m, i) => (
            <Pressable key={m.route} onPress={() => router.push(m.route as never)} style={[styles.menuRow, i > 0 && styles.menuRowDivider]}>
              <Feather name={m.icon} size={20} color={tokens.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{m.label}</Text>
                <Text style={styles.menuDetail}>{m.detail}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={tokens.textMuted} />
            </Pressable>
          ))}
        </Card>
      </ScrollView>
      <OptionSheet
        open={picker === 'color'}
        title="Color mode"
        options={COLOR_OPTIONS}
        selected={colorMode}
        onSelect={(id) => setColorMode(id as ColorMode)}
        onClose={() => setPicker(null)}
      />
      <OptionSheet
        open={picker === 'font'}
        title="Font style"
        options={FONT_OPTIONS}
        selected={fontStyle}
        onSelect={(id) => setFontStyle(id as FontStyle)}
        onClose={() => setPicker(null)}
      />
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  activeBadge: { backgroundColor: tokens.accent, borderRadius: 999, color: tokens.onAccent, fontSize: tokens.font.sm, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  savedHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  savedRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 12 },
  smallButton: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  backdrop: { backgroundColor: tokens.scrim, flex: 1 },
  body: { flex: 1, padding: tokens.space.md },
  bodyText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  chip: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: tokens.accent, borderColor: tokens.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chipText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  chipTextActive: { color: tokens.onAccent, fontWeight: '700' },
  closeButton: { padding: 6 },
  contextInput: { width: 110 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, paddingHorizontal: 14, paddingVertical: 12 },
  menuDetail: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  menuLabel: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12 },
  menuRowDivider: { borderTopColor: tokens.border, borderTopWidth: 1 },
  modelRow: { flexDirection: 'row', gap: 8 },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: tokens.space.md, paddingBottom: 28 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetRow: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 12 },
  sheetRowDetail: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  sheetRowText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  sheetRowTextActive: { color: tokens.text, fontWeight: '700' },
  sheetTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
