import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Modal, PermissionsAndroid, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Button, Card, Field } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { getApiKey, setApiKey } from '../src/lib/keys';
import { getUniversal, parseContextWindow, setUniversal, UniversalConfig } from '../src/lib/universal';
import { deleteModelSetup, listModelSetups, saveModelSetup, ModelSetup } from '../src/lib/modelSetups';
// No ads/payment import in GitHub v1 — see src/lib/ads.ts (ADS_ENABLED = false).
import { ColorMode, FontStyle, useColorMode, useFontStyle, useTokens } from '../src/lib/tokens';

// Settings is the hub, laid out as clean grouped rows (icon, title,
// short subtitle). Group 1 is the person + device: Profile, Color mode,
// Font style, Permissions. Group 2 is the tool pages — Connections,
// Skills, Plugins, MCP servers, GitHub install, Routines.
// Nothing stacks all of them on one page. Deliberately NOT here: no
// Sharing section, no Voice section, no Upgrade/Billing, no
// Capabilities toggles (no code execution, no web search toggle, no
// memory-from-chats toggle — TeamBots has none of those), no
// Notifications toggle (no notification system), no Time & focus.
const MENU: { label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }[] = [
  { label: 'Main Chat avatar', detail: 'Pick Main Chat\'s avatar', icon: 'smile', route: '/main-avatar' },
  { label: 'Connections', detail: 'Add and enable connections', icon: 'layers', route: '/connect' },
  { label: 'Skills', detail: 'Instruction templates', icon: 'zap', route: '/skills' },
  { label: 'Plugins', detail: 'Installed plugin definitions', icon: 'package', route: '/plugins' },
  { label: 'MCP servers', detail: 'HTTP/SSE tool servers', icon: 'server', route: '/mcp' },
  { label: 'GitHub install', detail: 'Install skills, plugins, MCP servers', icon: 'github', route: '/github-install' },
  { label: 'Routines', detail: 'Scheduled skills and routines', icon: 'clock', route: '/routines' },
  { label: 'Legal', detail: 'Privacy, terms, ads, refunds & feedback', icon: 'shield', route: '/legal' },
  { label: 'Ads & payments', detail: 'Plans and premium', icon: 'credit-card', route: '/ads-payments' },
];

type Provider = UniversalConfig['provider'];
const PROVIDER_LABELS: { id: Provider; label: string }[] = [
  { id: 'openai-compatible', label: 'OpenAI-compatible' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
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
  const [provider, setProvider] = useState<Provider>('openai-compatible');
  const [apiKey, setApiKeyState] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [contextWindow, setContextWindow] = useState('8192');
  const [msg, setMsg] = useState('');
  const [savedSetups, setSavedSetups] = useState<ModelSetup[]>([]);
  const [active, setActive] = useState<UniversalConfig | null>(null);

  const refreshSaved = useCallback(async () => {
    try {
      const [setups, u] = await Promise.all([listModelSetups(), getUniversal()]);
      setSavedSetups(setups);
      setActive(u);
    } catch { /* list stays as it was */ }
  }, []);

  useEffect(() => {
    (async () => {
      const u = await getUniversal();
      setProvider(u.provider);
      setEndpoint(u.endpoint);
      setModel(u.model);
      setContextWindow(String(u.contextWindow));
      setApiKeyState((await getApiKey(u.provider)) ?? '');
    })().catch(() => {});
    refreshSaved().catch(() => {});
  }, [refreshSaved]);

  // Permissions row: shows the REAL status, never a claimed one. Camera
  // status comes from the image picker (a status check, not a prompt);
  // microphone status comes from the OS check on Android. On any other
  // platform, or if a check fails, the row says so and opens system
  // settings instead of claiming a status. Refreshed every time this
  // screen is focused, so returning from system settings updates it.
  const refreshPermissions = useCallback(async () => {
    try {
      const cam = await ImagePicker.getCameraPermissionsAsync();
      const camLabel = cam.status === 'granted' ? 'granted' : cam.status === 'denied' ? 'denied' : 'not set';
      let micLabel = 'check in system settings';
      if (Platform.OS === 'android') {
        micLabel = (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO)) ? 'granted' : 'not granted';
      }
      setPermText(`Camera: ${camLabel} · Microphone: ${micLabel}`);
    } catch {
      setPermText('Open system settings to review');
    }
  }, []);
  useFocusEffect(useCallback(() => { refreshPermissions().catch(() => {}); }, [refreshPermissions]));

  async function changeProvider(p: Provider) {
    setProvider(p);
    // Each provider has its own key in secure storage; show that one.
    setApiKeyState((await getApiKey(p)) ?? '');
  }

  async function save() {
    const trimmedModel = model.trim();
    if (!trimmedModel) { setMsg('Enter a model name.'); return; }
    // A model ID never contains a space: a display name typed here (for
    // example "Inkling Small (free)") is sent verbatim to the provider
    // and rejected there, surfacing only as a bare error number in chat.
    // Reject it at save time with a usable hint instead.
    if (/\s/.test(trimmedModel)) { setMsg('Enter the exact API model ID, with no spaces (for example thinkingmachines/inkling:free), not the display name.'); return; }
    const parsedWindow = parseContextWindow(contextWindow);
    if (parsedWindow === null) { setMsg('Context window must be a number, or shorthand like 256k, 546k, or 1M.'); return; }
    const trimmedEndpoint = endpoint.trim();
    if (provider === 'openai-compatible' && trimmedEndpoint && !/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(trimmedEndpoint)) {
      setMsg('Endpoint must be an https:// URL with no query string, or blank for OpenAI.'); return;
    }
    await setApiKey(provider, apiKey);
    // The endpoint is only ever used for openai-compatible (see providers.ts),
    // but it is preserved across provider switches so switching back does not lose it.
    await setUniversal({ provider, model: trimmedModel, endpoint: trimmedEndpoint, contextWindow: parsedWindow });
    // The just-saved setup joins the list below, and it is the active one.
    // No success note is shown under the form anymore: the new row in the
    // list below is the confirmation that the save worked.
    await saveModelSetup({ provider, model: trimmedModel, endpoint: trimmedEndpoint, contextWindow: parsedWindow });
    setMsg('');
    // Empty the form so the next model can be added straight away. The
    // saved key stays in secure storage (clearing the field does not
    // delete it); only a later Save with an empty key field would.
    setProvider('openai-compatible');
    setApiKeyState('');
    setEndpoint('');
    setModel('');
    setContextWindow('8192');
    await refreshSaved();
  }

  // Activate a saved setup: it becomes the one every chat uses, and its
  // values are loaded back into the form so they can be seen or edited.
  async function useSetup(s: ModelSetup) {
    await setUniversal({ provider: s.provider, model: s.model, endpoint: s.endpoint, contextWindow: s.contextWindow });
    setProvider(s.provider);
    setEndpoint(s.endpoint);
    setModel(s.model);
    setContextWindow(String(s.contextWindow));
    setApiKeyState((await getApiKey(s.provider)) ?? '');
    setMsg('');
    await refreshSaved();
  }

  function deleteSetup(s: ModelSetup) {
    Alert.alert('Delete saved model?', `${s.model} will be removed from the list below.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          // The active chat config is left untouched: deleting a row only
          // removes it from the list, it does not switch the active model.
          await deleteModelSetup(s.id);
          await refreshSaved();
        },
      },
    ]);
  }

  // Ads + payments are deferred (GitHub v1). There is intentionally no
  // purchase button in this version: a button that granted premium with
  // no payment would be a fake-purchase path. See src/lib/ads.ts.

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
          <Pressable onPress={() => Linking.openSettings()} style={[styles.menuRow, styles.menuRowDivider]}>
            <Feather name="shield" size={20} color={tokens.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={styles.menuLabel}>Permissions</Text>
              <Text style={styles.menuDetail}>{permText}</Text>
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
        <Text style={styles.sectionTitle}>Model setup</Text>
        <Text style={styles.sub}>Save as many models as you like. The active one is used in every chat. Keys stay in secure storage only.</Text>
        <Card>
          <Text style={styles.bold}>Provider</Text>
          <View style={styles.chipRow}>
            {PROVIDER_LABELS.map((p) => (
              <Pressable key={p.id} onPress={() => changeProvider(p.id)} style={[styles.chip, provider === p.id && styles.chipActive]}>
                <Text style={[styles.chipText, provider === p.id && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <Field label="API key" secure onChangeText={setApiKeyState} value={apiKey} />
          {provider === 'openai-compatible' && (
            <Field label="API endpoint (blank = OpenAI)" onChangeText={setEndpoint} placeholder="https://api.openai.com/v1/chat/completions" value={endpoint} />
          )}
          <View style={styles.modelRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>Model</Text>
              <TextInput
                accessibilityLabel="Model name"
                onChangeText={setModel}
                placeholder="Model ID from your provider"
                placeholderTextColor={tokens.textMuted}
                style={styles.input}
                value={model}
              />
            </View>
            <View>
              <Text style={styles.bold}>Context</Text>
              <TextInput
                accessibilityLabel="Context window"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setContextWindow}
                placeholder="e.g. 256k, 1M"
                placeholderTextColor={tokens.textMuted}
                style={[styles.input, styles.contextInput]}
                value={contextWindow}
              />
            </View>
          </View>
          <Button title="Save" onPress={save} />
        </Card>
        {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
        <Text style={styles.sectionTitle}>Saved models</Text>
        <Card>
          {savedSetups.length === 0 ? (
            <Text style={styles.sub}>No saved models yet. Save one above and it will appear here.</Text>
          ) : savedSetups.map((s, i) => {
            const isActive = active !== null && active.provider === s.provider && active.model === s.model && active.endpoint === s.endpoint;
            const providerLabel = PROVIDER_LABELS.find((p) => p.id === s.provider)?.label ?? s.provider;
            return (
              <View key={s.id} style={[styles.savedRow, i > 0 && styles.menuRowDivider]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.savedHead}>
                    <Text style={styles.menuLabel}>{s.model}</Text>
                    {isActive ? <Text style={styles.activeBadge}>Active</Text> : null}
                  </View>
                  <Text style={styles.menuDetail}>{providerLabel}{s.endpoint ? ` · ${s.endpoint}` : ' · Default endpoint'} · Context {s.contextWindow}</Text>
                  <Text style={styles.menuDetail}>Key: stored in secure storage, never shown here.</Text>
                </View>
                <Pressable onPress={() => useSetup(s)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Use</Text>
                </Pressable>
                <Pressable onPress={() => deleteSetup(s)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>Delete</Text>
                </Pressable>
              </View>
            );
          })}
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
