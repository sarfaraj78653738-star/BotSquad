import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Field } from '../src/components/ui';
import { MenuButton } from '../src/components/Drawer';
import { getSetting, setSetting } from '../src/lib/db';
import { getApiKey, setApiKey } from '../src/lib/keys';
// No ads/payment import in GitHub v1 — see src/lib/ads.ts (ADS_ENABLED = false).
import { PROVIDERS, ProviderId } from '../src/lib/types';
import { tokens } from '../src/lib/tokens';

const PRIVACY = `TeamBots Privacy — GitHub v1 (to be reviewed before any store release):
• Chats, bots, skills, routines, and memory notes stay on your device in local storage.
• Your API keys are stored only in the device secure store (Android Keystore). They are sent only to the provider you chose, in a direct call from your device. They are never sent to TeamBots or to any other server.
• This GitHub version has NO ads, NO payments, and NO login. The only third parties are the model provider you chose, and any GitHub repo or MCP server you add yourself. No analytics or tracking is shipped.
• This app is not affiliated with, endorsed by, or connected to any other AI product, and it makes no claim to be an official product of any other company.`;

// Settings is the hub for everything API- and tool-related: provider
// keys live here, and Connections (connections, skills, plugins, MCP
// servers, GitHub install), Routines and Browser are reached from the
// menu below — not from the drawer and not from anywhere else.
const MENU: { label: string; detail: string; icon: React.ComponentProps<typeof Feather>['name']; route: string }[] = [
  { label: 'Connections', detail: 'Connections, skills, plugins, MCP servers, GitHub install', icon: 'layers', route: '/connect' },
  { label: 'Routines', detail: 'Scheduled skills and routines', icon: 'clock', route: '/routines' },
  { label: 'Browser', detail: 'Open a public page inside the app', icon: 'globe', route: '/browser' },
];

export default function SettingsScreen() {
  const router = useRouter();
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [adsRemoved, setAdsRemoved] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const next: Record<string, string> = {};
      for (const p of PROVIDERS) next[p.id] = (await getApiKey(p.id)) ?? '';
      setKeys(next);
      setAdsRemoved((await getSetting('premium_ads_removed')) === '1');
    })().catch(() => {});
  }, []);

  async function saveKey(provider: ProviderId) {
    await setApiKey(provider, keys[provider] ?? '');
    setMsg(`Key for ${provider} saved in secure storage (not shown again in full).`);
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
        <Text style={styles.sectionTitle}>API keys</Text>
        <Text style={styles.sub}>Bring your own key. No key is supplied by TeamBots, and no key leaves the device except to the provider you chose.</Text>
        {PROVIDERS.map((p) => (
          <Card key={p.id}>
            <Text style={styles.bold}>{p.label}</Text>
            <Text style={styles.sub}>Models: {p.models.join(', ')}</Text>
            <Field label="API key (stored in secure store only)" secure onChangeText={(v) => setKeys({ ...keys, [p.id]: v })} value={keys[p.id] ?? ''} />
            <Button title="Save key" onPress={() => saveKey(p.id)} />
          </Card>
        ))}
        {msg ? <Card><Text>{msg}</Text></Card> : null}
        <Card>
          <Text style={styles.bold}>Ads & payments — arrive later</Text>
          <Text style={styles.sub}>This GitHub version has no ads and takes no payment. When ads and premium return, premium will remove ads ONLY and will never lock a feature. Current ad state: {adsRemoved ? 'ads removed (legacy local flag)' : 'no ads in this version'}.</Text>
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
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  menuDetail: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  menuLabel: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  menuRow: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 12 },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
