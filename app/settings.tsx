import { useCallback, useRef, useState } from 'react';
import { Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Card } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import * as FileSystem from 'expo-file-system';
import { AlertDialog } from '../src/components/AlertDialog';
import { getDb, listBots, listConnections, listMcpServers, wipeAllData } from '../src/lib/db';
import { clearGoogleClientId, signOutGoogle } from '../src/lib/googleAuth';
import { deleteConnectionToken, deleteMcpToken } from '../src/lib/connections';
import { cancelSubscription } from '../src/lib/premium';
import { setApiKey } from '../src/lib/keys';
import { ProviderId } from '../src/lib/types';
import { workspaceDir } from '../src/lib/workspace';
// No ads/payment import in GitHub v1 — see src/lib/ads.ts (ADS_ENABLED = false).
import { ColorMode, FontStyle, useColorMode, useFontStyle, useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Settings is the hub, laid out as clean grouped rows (icon, title,
// short subtitle). Group 1 is the person + device: Profile, Color mode,
// Font style, Permissions. Group 2 is the tool pages — Model setup, Connections,
// Skills, Plugins, MCP servers, GitHub install, Routines.
// Group 3 is the account: Log out and Delete account, each behind a
// confirmation popup. The old Login row is gone: sign-in now happens
// through the first-run launch gate, not from Settings.
// Nothing stacks all of them on one page. Deliberately NOT here: no
// Sharing section, no Voice section, no Upgrade/Billing, no
// Capabilities toggles (no code execution, no web search toggle, no
// memory-from-chats toggle — BotSquad has none of those), no
// Notifications toggle (no notification system), no Time & focus.
const MENU: { labelKey: string; detailKey: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }[] = [
  { labelKey: 'modelSetup', detailKey: 'modelSetupDetail', icon: 'cpu', route: '/model-setup' },
  { labelKey: 'mainAvatar', detailKey: 'mainAvatarDetail', icon: 'smile', route: '/main-avatar' },
  { labelKey: 'connections', detailKey: 'connectionsDetail', icon: 'layers', route: '/connect' },
  { labelKey: 'skills', detailKey: 'skillsDetail', icon: 'zap', route: '/skills' },
  { labelKey: 'plugins', detailKey: 'pluginsDetail', icon: 'package', route: '/plugins' },
  { labelKey: 'mcpServers', detailKey: 'mcpServersDetail', icon: 'server', route: '/mcp' },
  { labelKey: 'githubInstall', detailKey: 'githubInstallDetail', icon: 'github', route: '/github-install' },
  { labelKey: 'routines', detailKey: 'routinesDetail', icon: 'clock', route: '/routines' },
  { labelKey: 'legal', detailKey: 'legalDetail', icon: 'shield', route: '/legal' },
];

const COLOR_OPTIONS: { id: ColorMode; labelKey: string; detailKey: string }[] = [
  { id: 'system', labelKey: 'colorSystem', detailKey: 'colorSystemDetail' },
  { id: 'light', labelKey: 'colorLight', detailKey: 'colorLightDetail' },
  { id: 'dark', labelKey: 'colorDark', detailKey: 'colorDarkDetail' },
];

const FONT_OPTIONS: { id: FontStyle; labelKey: string; detailKey: string }[] = [
  { id: 'default', labelKey: 'fontDefault', detailKey: 'fontDefaultDetail' },
  { id: 'system', labelKey: 'fontSystem', detailKey: 'fontSystemDetail' },
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
  const [language] = useLanguage();
  const [picker, setPicker] = useState<'color' | 'font' | null>(null);
  const [dialog, setDialog] = useState<'logout' | 'delete' | null>(null);
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
  // Dialogs use the themed AlertDialog (not Alert.alert): Alert.alert
  // renders the SYSTEM dialog, which ignores the app's color mode and
  // showed up white in dark mode (bug 2026-10-31, Camera/Mic shots).
  const permResults = useRef<Record<string, string>>({});
  const [permStep, setPermStep] = useState<null | 'mic' | 'camera' | 'photos' | 'files'>(null);
  const permAdvance = useCallback((step: 'mic' | 'camera' | 'photos' | 'files', value: string) => {
    permResults.current[step] = value;
    if (step === 'mic') setPermStep('camera');
    else if (step === 'camera') setPermStep('photos');
    else if (step === 'photos') setPermStep('files');
    else {
      setPermStep(null);
      const r = permResults.current;
      setPermText(`Mic: ${r.mic} · Camera: ${r.camera} · Photos: ${r.photos} · Files: ${r.files}`);
    }
  }, []);
  const requestMic = useCallback(async (): Promise<string> => {
    if (Platform.OS !== 'android') return 'not asked';
    try {
      const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
      return r === 'granted' ? 'granted' : 'denied';
    } catch { return 'denied'; }
  }, []);
  const requestFiles = useCallback(async (): Promise<string> => {
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
  }, []);
  const runPermissionFlow = useCallback(() => {
    permResults.current = {};
    setPermStep('mic');
  }, []);


  // Account actions (user order 2026-10-31): Log out only ends the
  // Google session — chats, files, and settings stay on the device.
  // Delete account wipes everything on the phone: the session, all
  // database rows, all stored keys and connection tokens, and the
  // workspace directory. It ALSO cancels the Remove Ads subscription
  // first (best-effort, while still signed in) so billing stops too.
  // Both pause on a confirmation popup first.
  async function doLogout() {
    setDialog(null);
    await signOutGoogle().catch(() => {});
    router.replace('/login');
  }

  async function doDeleteAccount() {
    setDialog(null);
    try {
      // Cancel the subscription FIRST: it needs the Google session,
      // which signOutGoogle below ends. Best-effort — if this fails
      // (offline, no subscription), deletion still proceeds and the
      // user can cancel from Razorpay/bank instead.
      await cancelSubscription().catch(() => {});
      // Collect secret owners BEFORE wiping the database rows that
      // name them.
      const [conns, mcps, bots] = await Promise.all([listConnections(), listMcpServers(), listBots()]);
      const db = await getDb();
      const setups = await db.getAllAsync<{ provider: string }>('SELECT provider FROM model_setups');
      const providers = [...new Set([...bots.map((b) => b.provider), ...setups.map((s) => s.provider)])];
      await Promise.all([
        ...conns.map((c) => deleteConnectionToken(c.id)),
        ...mcps.map((m) => deleteMcpToken(m.id)),
        ...providers.map((p) => setApiKey(p as ProviderId, '')),
      ]).catch(() => {});
      await signOutGoogle().catch(() => {});
      await clearGoogleClientId().catch(() => {});
      await wipeAllData().catch(() => {});
      const dir = await workspaceDir().catch(() => '');
      if (dir) await FileSystem.deleteAsync(dir, { idempotent: true }).catch(() => {});
    } catch { /* wipe is best-effort; the gate still sends the user to login */ }
    router.replace('/login');
  }

  const colorOptions = COLOR_OPTIONS.map((o) => ({ id: o.id, label: t(language, o.labelKey), detail: t(language, o.detailKey) }));
  const fontOptions = FONT_OPTIONS.map((o) => ({ id: o.id, label: t(language, o.labelKey), detail: t(language, o.detailKey) }));
  const colorLabel = colorOptions.find((o) => o.id === colorMode)?.label ?? 'System';
  const fontLabel = fontOptions.find((o) => o.id === fontStyle)?.label ?? 'Default';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>{t(language, 'settings')}</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.sectionTitle}>{t(language, 'general')}</Text>
        <Card>
          <Pressable onPress={() => router.push('/profile' as never)} style={styles.menuRow}>
            <Feather name="user" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{t(language, 'profile')}</Text>
              <Text style={styles.menuDetail}>{t(language, 'profileDetail')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => setPicker('color')} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="moon" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{t(language, 'colorMode')}</Text>
              <Text style={styles.menuDetail}>{colorLabel}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => setPicker('font')} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="type" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{t(language, 'fontStyle')}</Text>
              <Text style={styles.menuDetail}>{fontLabel}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={runPermissionFlow} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="shield" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{t(language, 'permissions')}</Text>
              <Text style={styles.menuDetail}>{permText}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => router.push('/ads-payments' as never)} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="credit-card" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>{t(language, 'adsPayments')}</Text>
              <Text style={styles.menuDetail}>{t(language, 'adsPaymentsDetail')}</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
        </Card>
        <Text style={styles.sectionTitle}>{t(language, 'tools')}</Text>
        <Card>
          {MENU.map((m, i) => (
            <Pressable key={m.route} onPress={() => router.push(m.route as never)} style={[styles.menuRow, i > 0 && styles.menuRowDivider]}>
              <Feather name={m.icon} size={20} color={tokens.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={styles.menuLabel}>{t(language, m.labelKey)}</Text>
                <Text style={styles.menuDetail}>{t(language, m.detailKey)}</Text>
              </View>
              <Feather name="chevron-right" size={20} color={tokens.textMuted} />
            </Pressable>
          ))}
        </Card>
        <Text style={styles.sectionTitle}>Account</Text>
        <Card>
          <Pressable onPress={() => setDialog('logout')} style={styles.menuRow}>
            <Feather name="log-out" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Log out</Text>
              <Text style={styles.menuDetail}>Sign out of Google on this phone. Your chats and files stay on the device.</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
          <Pressable onPress={() => setDialog('delete')} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="trash-2" size={20} color={tokens.danger} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.menuLabel, styles.menuLabelDanger]}>Delete account</Text>
              <Text style={styles.menuDetail}>Permanently delete everything on this phone.</Text>
            </View>
            <Feather name="chevron-right" size={20} color={tokens.textMuted} />
          </Pressable>
        </Card>
      </ScrollView>
      <OptionSheet
        open={picker === 'color'}
        title={t(language, 'colorMode')}
        options={colorOptions}
        selected={colorMode}
        onSelect={(id) => setColorMode(id as ColorMode)}
        onClose={() => setPicker(null)}
      />
      <OptionSheet
        open={picker === 'font'}
        title={t(language, 'fontStyle')}
        options={fontOptions}
        selected={fontStyle}
        onSelect={(id) => setFontStyle(id as FontStyle)}
        onClose={() => setPicker(null)}
      />
      <AlertDialog
        visible={dialog === 'logout'}
        title="Log out?"
        message="You will be signed out of Google on this phone. Your chats, files, and settings stay on the device. You can sign in again any time."
        buttons={[
          { text: 'Cancel', style: 'cancel' },
          { text: 'Log out', onPress: () => { void doLogout(); } },
        ]}
        onDismiss={() => setDialog(null)}
      />
      <AlertDialog
        visible={dialog === 'delete'}
        title="Delete account?"
        message="This permanently deletes your Google sign-in, all bots, chats, skills, plugins, connections, settings, profile, and workspace files from this phone. Your Remove Ads subscription (if any) will also be cancelled. This cannot be undone."
        buttons={[
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => { void doDeleteAccount(); } },
        ]}
        onDismiss={() => setDialog(null)}
      />
      <AlertDialog
        visible={permStep !== null}
        title={permStep === 'mic' ? 'Microphone' : permStep === 'camera' ? 'Camera' : permStep === 'photos' ? 'Photos' : 'Files'}
        message={permStep === 'mic' ? 'Allow BotSquad to use your microphone for voice input?' : permStep === 'camera' ? 'Allow BotSquad to use your camera?' : permStep === 'photos' ? 'Allow BotSquad to use your photos?' : 'Allow BotSquad to read files you pick?'}
        buttons={[
          { text: 'Deny', style: 'cancel', onPress: () => { if (permStep) permAdvance(permStep, 'denied'); } },
          { text: 'Allow', onPress: async () => {
            if (!permStep) return;
            const step = permStep;
            let value = 'denied';
            try {
              if (step === 'mic') value = await requestMic();
              else if (step === 'camera') { const r = await ImagePicker.requestCameraPermissionsAsync(); value = r.status === 'granted' ? 'granted' : 'denied'; }
              else if (step === 'photos') { const r = await ImagePicker.requestMediaLibraryPermissionsAsync(); value = r.status === 'granted' ? 'granted' : 'denied'; }
              else value = await requestFiles();
            } catch { value = 'denied'; }
            permAdvance(step, value);
          } },
        ]}
        onDismiss={() => setPermStep(null)}
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
  menuLabelDanger: { color: tokens.danger },
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
