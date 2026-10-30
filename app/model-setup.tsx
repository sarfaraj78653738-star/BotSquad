import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Button, Card, Field } from '../src/components/ui';
import { getApiKey, setApiKey } from '../src/lib/keys';
import { getUniversal, parseContextWindow, setUniversal, UniversalConfig } from '../src/lib/universal';
import { deleteModelSetup, listModelSetups, saveModelSetup, ModelSetup } from '../src/lib/modelSetups';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Model setup (user order 2026-10-29): this used to sit open on the
// Settings page, making it long. Now it is its own section inside
// Settings, reached from the Settings menu — same form, same saved
// models, same rules. A model ID never contains a space; a display
// name typed here is rejected at save time with a usable hint.
// Context accepts shorthand (256k, 546k, 1M) or a plain number.
type Provider = UniversalConfig['provider'];
const PROVIDER_LABELS: { id: Provider; label: string }[] = [
  { id: 'openai-compatible', label: 'OpenAI-compatible' },
  { id: 'anthropic', label: 'Anthropic' },
  { id: 'gemini', label: 'Gemini' },
];

export default function ModelSetupScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [provider, setProvider] = useState<Provider>('openai-compatible');
  const [apiKey, setApiKeyState] = useState('');
  const [endpoint, setEndpoint] = useState('');
  const [model, setModel] = useState('');
  const [contextWindow, setContextWindow] = useState('');
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

  async function changeProvider(p: Provider) {
    setProvider(p);
    // Each provider has its own key in secure storage; show that one.
    setApiKeyState((await getApiKey(p)) ?? '');
  }

  async function save() {
    const trimmedModel = model.trim();
    if (!trimmedModel) { setMsg(t(language, 'enterModel')); return; }
    // A model ID never contains a space: a display name typed here (for
    // example "Inkling Small (free)") is sent verbatim to the provider
    // and rejected there, surfacing only as a bare error number in chat.
    // Reject it at save time with a usable hint instead.
    if (/\s/.test(trimmedModel)) { setMsg(t(language, 'noSpaces')); return; }
    const parsedWindow = parseContextWindow(contextWindow);
    if (parsedWindow === null) { setMsg(t(language, 'contextInvalid')); return; }
    const trimmedEndpoint = endpoint.trim();
    if (provider === 'openai-compatible' && trimmedEndpoint && !/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(trimmedEndpoint)) {
      setMsg(t(language, 'endpointInvalid')); return;
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
    // Context is left EMPTY on purpose (user order 2026-10-30): no
    // silent 8192 default — save rejects a blank window, so the next
    // model must type its own. (Loading the active model's values on
    // open, and via Use, is not a default — those are saved values.)
    setProvider('openai-compatible');
    setApiKeyState('');
    setEndpoint('');
    setModel('');
    setContextWindow('');
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
    Alert.alert(t(language, 'deleteSavedTitle'), `${s.model} ${t(language, 'willBeRemovedList')}`, [
      { text: t(language, 'cancel'), style: 'cancel' },
      {
        text: t(language, 'delete'), style: 'destructive',
        onPress: async () => {
          // The active chat config is left untouched: deleting a row only
          // removes it from the list, it does not switch the active model.
          await deleteModelSetup(s.id);
          await refreshSaved();
        },
      },
    ]);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>{t(language, 'settings')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t(language, 'modelSetup')}</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
        <Text style={styles.sub}>{t(language, 'modelIntro')}</Text>
        <Card>
          <Text style={styles.bold}>{t(language, 'providerLabel')}</Text>
          <View style={styles.chipRow}>
            {PROVIDER_LABELS.map((p) => (
              <Pressable key={p.id} onPress={() => changeProvider(p.id)} style={[styles.chip, provider === p.id && styles.chipActive]}>
                <Text style={[styles.chipText, provider === p.id && styles.chipTextActive]}>{p.label}</Text>
              </Pressable>
            ))}
          </View>
          <Field label={t(language, 'apiKeyLabel')} secure onChangeText={setApiKeyState} value={apiKey} />
          {provider === 'openai-compatible' && (
            <Field label={t(language, 'apiEndpointLabel')} onChangeText={setEndpoint} placeholder="https://api.openai.com/v1/chat/completions" value={endpoint} />
          )}
          <View style={styles.modelRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.bold}>{t(language, 'modelLabel')}</Text>
              <TextInput
                accessibilityLabel="Model name"
                onChangeText={setModel}
                placeholder={t(language, 'modelIdPlaceholder')}
                placeholderTextColor={tokens.textMuted}
                style={styles.input}
                value={model}
              />
            </View>
            <View>
              <Text style={styles.bold}>{t(language, 'contextLabel')}</Text>
              <TextInput
                accessibilityLabel="Context window"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setContextWindow}
                placeholder={t(language, 'contextPlaceholder')}
                placeholderTextColor={tokens.textMuted}
                style={[styles.input, styles.contextInput]}
                value={contextWindow}
              />
            </View>
          </View>
          <Button title={t(language, 'saveBtn')} onPress={save} />
        </Card>
        {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
        <Text style={styles.sectionTitle}>{t(language, 'savedModels')}</Text>
        <Card>
          {savedSetups.length === 0 ? (
            <Text style={styles.sub}>{t(language, 'noSavedModels')}</Text>
          ) : savedSetups.map((s, i) => {
            const isActive = active !== null && active.provider === s.provider && active.model === s.model && active.endpoint === s.endpoint;
            const providerLabel = PROVIDER_LABELS.find((p) => p.id === s.provider)?.label ?? s.provider;
            return (
              <View key={s.id} style={[styles.savedRow, i > 0 && styles.menuRowDivider]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.savedHead}>
                    <Text style={styles.menuLabel}>{s.model}</Text>
                    {isActive ? <Text style={styles.activeBadge}>{t(language, 'activeBadge')}</Text> : null}
                  </View>
                  <Text style={styles.menuDetail}>{providerLabel}{s.endpoint ? ` · ${s.endpoint}` : ` · ${t(language, 'defaultEndpoint')}`} · {t(language, 'contextWord')} {s.contextWindow}</Text>
                  <Text style={styles.menuDetail}>{t(language, 'keyStored')}</Text>
                </View>
                <Pressable onPress={() => useSetup(s)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>{t(language, 'useBtn')}</Text>
                </Pressable>
                <Pressable onPress={() => deleteSetup(s)} style={styles.smallButton}>
                  <Text style={styles.smallButtonText}>{t(language, 'delete')}</Text>
                </Pressable>
              </View>
            );
          })}
        </Card>
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  activeBadge: { backgroundColor: tokens.accent, borderRadius: 999, color: tokens.onAccent, fontSize: tokens.font.sm, fontWeight: '700', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 2 },
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
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
  menuRowDivider: { borderTopColor: tokens.border, borderTopWidth: 1 },
  modelRow: { flexDirection: 'row', gap: 8 },
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  savedHead: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  savedRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: 12 },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  smallButton: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  smallButtonText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
