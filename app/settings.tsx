import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Field } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { getSetting } from '../src/lib/db';
import { getApiKey, setApiKey } from '../src/lib/keys';
import { getUniversal, setUniversal, UniversalConfig } from '../src/lib/universal';
// No ads/payment import in GitHub v1 — see src/lib/ads.ts (ADS_ENABLED = false).
import { tokens } from '../src/lib/tokens';

const PRIVACY = `TeamBots Privacy — GitHub v1 (to be reviewed before any store release):
• Chats, bots, skills, routines, and memory notes stay on your device in local storage.
• Your API keys are stored only in the device secure store (Android Keystore). They are sent only to the provider you chose, in a direct call from your device. They are never sent to TeamBots or to any other server.
• This GitHub version has NO ads, NO payments, and NO login. The only third parties are the model provider you chose, and any GitHub repo or MCP server you add yourself. No analytics or tracking is shipped.
• This app is not affiliated with, endorsed by, or connected to any other AI product, and it makes no claim to be an official product of any other company.`;

// Settings is the hub: one universal model setup (below) plus a menu
// where each tool area has its own page — Connections, Skills,
// Plugins, MCP servers, GitHub install, Routines, Browser. Nothing
// stacks all of them on one page.
const MENU: { label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }[] = [
  { label: 'Connections', detail: 'Add and enable connections', icon: 'layers', route: '/connect' },
  { label: 'Skills', detail: 'Instruction templates', icon: 'zap', route: '/skills' },
  { label: 'Plugins', detail: 'Installed plugin definitions', icon: 'package', route: '/plugins' },
  { label: 'MCP servers', detail: 'HTTP/SSE tool servers', icon: 'server', route: '/mcp' },
  { label: 'GitHub install', detail: 'Install skills, plugins, MCP servers', icon: 'github', route: '/github-install' },
  { label: 'Routines', detail: 'Scheduled skills and routines', icon: 'clock', route: '/routines' },
  { label: 'Browser', detail: 'Open a public page inside the app', icon: 'globe', route: '/browser' },
];

type Provider = UniversalConfig['provider'];
const PROVIDER_LABELS: { id: Provider; label: string }[] = [
  { id: 'openai-compatible', label: 'OpenAI-compatible' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>('openai-compatible');
  const [apiKey, setApiKeyState] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [contextWindow, setContextWindow] = useState('8192');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const u = await getUniversal();
      setProvider(u.provider);
      setEndpoint(u.endpoint);
      setModel(u.model);
      setContextWindow(String(u.contextWindow));
      setApiKeyState((await getApiKey(u.provider)) ?? '');
    })().catch(() => {});
  }, []);

  async function changeProvider(p: Provider) {
    setProvider(p);
    // Each provider has its own key in secure storage; show that one.
    setApiKeyState((await getApiKey(p)) ?? '');
  }

  async function save() {
    const trimmedModel = model.trim();
    if (!trimmedModel) { setMsg('Enter a model name.'); return; }
    const parsedWindow = parseInt(contextWindow, 10);
    if (!Number.isFinite(parsedWindow)) { setMsg('Context window must be a number.'); return; }
    const trimmedEndpoint = endpoint.trim();
    if (provider === 'openai-compatible' && trimmedEndpoint && !/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(trimmedEndpoint)) {
      setMsg('Endpoint must be an https:// URL with no query string, or blank for OpenAI.');
      return;
    }
    await setApiKey(provider, apiKey);
    // The endpoint is only ever used for openai-compatible (see providers.ts),
    // but it is preserved across provider switches so switching back does not lose it.
    await setUniversal({ provider, model: trimmedModel, endpoint: trimmedEndpoint, contextWindow: parsedWindow });
    setMsg('Saved. This one setup applies to Main Chat, all bots, and group chat.');
  }

  // Ads + payments are deferred (GitHub v1). There is intentionally no
  // purchase button in this version: a button that granted premium with
  // no payment would be a fake-purchase path. See src/lib/ads.ts.

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        <Card>
          {MENU.map((m) => (
            <Pressable key={m.route} onPress={() => router.push(m.route as never)} style={styles.menuRow}>
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
        <Text style={styles.sub}>One setup for every chat. Keys stay in secure storage only.</Text>
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
          <Text style={styles.bold}>Model</Text>
          <View style={styles.modelRow}>
            <TextInput
              accessibilityLabel="Model name"
              onChangeText={setModel}
              placeholder="gpt-4o-mini"
              placeholderTextColor={tokens.textMuted}
              style={[styles.input, { flex: 1 }]}
              value={model}
            />
            <TextInput
              accessibilityLabel="Context window"
              keyboardType="number-pad"
              onChangeText={setContextWindow}
              placeholder="Context"
              placeholderTextColor={tokens.textMuted}
              style={[styles.input, styles.contextInput]}
              value={contextWindow}
            />
          </View>
          <Text style={styles.sub}>Max tokens, as a number.</Text>
          <Button title="Save" onPress={save} />
        </Card>
        {msg ? <Card><Text>{msg}</Text></Card> : null}
        <Card>
          <Text style={styles.bold}>Ads & payments</Text>
          <Text style={styles.sub}>No ads in this version.</Text>
        </Card>
        <Card>
          <Text style={styles.bold}>Privacy Policy</Text>
          <Text style={styles.bodyText}>{PRIVACY}</Text>
        </Card>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, padding: tokens.space.md },
  bodyText: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 24 },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  chip: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  chipActive: { backgroundColor: tokens.accent, borderColor: tokens.accent },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chipText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  chipTextActive: { color: tokens.onAccent, fontWeight: '700' },
  contextInput: { width: 110 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, paddingHorizontal: 14, paddingVertical: 12 },
  menuDetail: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  menuLabel: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12 },
  modelRow: { flexDirection: 'row', gap: 8 },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
