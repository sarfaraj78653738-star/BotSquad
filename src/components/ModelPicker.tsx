import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { getUniversal, setUniversal, UniversalConfig } from '../lib/universal';
import { listModelSetups, ModelSetup } from '../lib/modelSetups';
import { useTokens } from '../lib/tokens';

// Model pill for the composer bar. Tapping it opens a bottom sheet
// titled "Select model" listing the models usable with the current
// provider, current model first, with a checkmark on the current one
// and one plain, factual line per model. Selecting one changes only
// the universal model, never the provider. Only the universal model
// from Settings plus known non-branded provider models are listed;
// no third-party branded model families are named here.
const MODELS_BY_PROVIDER: Record<UniversalConfig['provider'], { id: string; description: string }[]> = {
  'openai-compatible': [
    { id: 'gpt-4o-mini', description: 'General chat model.' },
    { id: 'llama-3.3-70b-versatile', description: 'Large open model via the configured endpoint.' },
    { id: 'deepseek-chat', description: 'General chat model via the configured endpoint.' },
  ],
  anthropic: [],
  gemini: [
    { id: 'gemini-2.0-flash', description: 'General chat model.' },
  ],
};

export function ModelPicker() {
  const tokens = useTokens();
  const insets = useSafeAreaInsets();
  const styles = getStyles(tokens);
  const [model, setModel] = useState('gpt-4o-mini');
  const [provider, setProvider] = useState<UniversalConfig['provider']>('openai-compatible');
  const [saved, setSaved] = useState<ModelSetup[]>([]);
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const cfg = await getUniversal();
      setModel(cfg.model);
      setProvider(cfg.provider);
      setSaved(await listModelSetups());
    } catch { /* keep last shown model */ }
  }

  useEffect(() => { refresh().catch(() => {}); }, []);

  // Current model first, then the user's saved setups (each one switches
  // provider + endpoint + context window with it, not just the name),
  // then the built-in provider models. Saved setups are what make the
  // "add more models" flow in Settings usable from a chat.
  // The current model is already listed first, so a saved setup for that
  // same model + provider is skipped here to avoid a duplicate row; the
  // current row keeps it active with its provider and endpoint intact.
  const savedEntries = saved
    .filter((s) => !(s.model === model && s.provider === provider))
    .map((s) => ({
    key: `${s.provider}|${s.model}|${s.endpoint}`,
    id: s.model,
    provider: s.provider,
    description: s.provider === 'openai-compatible' ? 'Saved model.' : `Saved model (${s.provider}).`,
    apply: () => setUniversal({ provider: s.provider, model: s.model, endpoint: s.endpoint, contextWindow: s.contextWindow }),
  }));
  const models = [
    { key: `current|${model}`, id: model, provider, description: 'Current model.', apply: () => setUniversal({ model }) },
    ...savedEntries,
    ...MODELS_BY_PROVIDER[provider].map((m) => ({
      key: `${provider}|${m.id}`, id: m.id, provider, description: m.description, apply: () => setUniversal({ model: m.id }),
    })),
  ].filter((m, i, arr) => arr.findIndex((x) => x.key === m.key) === i);

  return (
    <View>
      <Pressable
        accessibilityLabel="Change model"
        accessibilityRole="button"
        onPress={async () => { if (!open) await refresh(); setOpen(true); }}
        style={styles.button}
      >
        <Text style={styles.buttonText} numberOfLines={1}>{model}</Text>
        <Feather name="chevron-down" size={16} color={tokens.text} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable accessibilityLabel="Close model picker" onPress={() => setOpen(false)} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>Select model</Text>
            <Pressable accessibilityLabel="Close model picker" onPress={() => setOpen(false)} style={styles.closeButton}>
              <Feather name="x" size={20} color={tokens.text} />
            </Pressable>
          </View>
          {models.map((m) => (
            <Pressable
              key={m.key}
              onPress={async () => { await m.apply(); setModel(m.id); setProvider(m.provider); setOpen(false); }}
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, m.id === model && styles.rowTextActive]} numberOfLines={1}>{m.id}</Text>
                <Text style={styles.rowDesc} numberOfLines={1}>{m.description}</Text>
              </View>
              {m.id === model ? <Feather name="check" size={18} color={tokens.text} /> : null}
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backdrop: { backgroundColor: tokens.scrim, flex: 1 },
  button: { alignItems: 'center', backgroundColor: tokens.surfaceMuted, borderRadius: 999, flexDirection: 'row', gap: 4, height: 36, justifyContent: 'center', maxWidth: 170, paddingHorizontal: 12 },
  buttonText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '600', maxWidth: 130 },
  closeButton: { padding: 6 },
  row: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingVertical: 12 },
  rowDesc: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  rowText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  rowTextActive: { color: tokens.text, fontWeight: '700' },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: tokens.space.md, paddingBottom: 28 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
});
