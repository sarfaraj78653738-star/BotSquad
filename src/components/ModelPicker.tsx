import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { getUniversal, setUniversal, UniversalConfig } from '../lib/universal';
import { listModelSetups, saveModelSetup, ModelSetup } from '../lib/modelSetups';
import { useLanguage, useTokens } from '../lib/tokens';
import { t } from '../lib/i18n';

// Model pill for the composer bar. Tapping it opens a bottom sheet
// titled "Select model". The sheet lists ONLY the user's own models:
// the current model first, then the models the user saved in Settings.
// No model is provided from the app side (user order 2026-10-29: the
// built-in gpt/llama/deepseek/gemini rows are removed, because tapping
// one overwrote the user's own model). Selecting a saved setup
// switches provider + endpoint + context window with it. Before any
// switch, the current setup is saved first, so switching can never
// lose a model.
export function ModelPicker() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = getStyles(tokens);
  const [model, setModel] = useState('');
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
  // provider + endpoint + context window with it, not just the name).
  // No built-in models are listed: only what the user saved in Settings.
  // The current model is already listed first, so a saved setup for that
  // same model + provider is skipped here to avoid a duplicate row; the
  // current row keeps it active with its provider and endpoint intact.
  const savedEntries = saved
    .filter((s) => !(s.model === model && s.provider === provider))
    .map((s) => ({
    key: `${s.provider}|${s.model}|${s.endpoint}`,
    id: s.model,
    provider: s.provider,
    description: s.provider === 'openai-compatible' ? t(language, 'savedModel') : `${t(language, 'savedModel')} (${s.provider}).`,
    apply: () => setUniversal({ provider: s.provider, model: s.model, endpoint: s.endpoint, contextWindow: s.contextWindow }),
  }));
  const models = [
    // No current row while no model is set: the sheet then lists
    // only saved models, never an empty or factory row.
    ...(model ? [{ key: `current|${model}`, id: model, provider, description: t(language, 'currentModel'), apply: () => setUniversal({ model }) }] : []),
    ...savedEntries,
  ].filter((m, i, arr) => arr.findIndex((x) => x.key === m.key) === i);

  return (
    <View>
      <Pressable
        accessibilityLabel="Change model"
        accessibilityRole="button"
        onPress={async () => { if (!open) await refresh(); setOpen(true); }}
        style={styles.button}
      >
        <Text style={styles.buttonText} numberOfLines={1}>{model || t(language, 'selectModel')}</Text>
        <Feather name="chevron-down" size={16} color={tokens.text} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable accessibilityLabel="Close model picker" onPress={() => setOpen(false)} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t(language, 'selectModel')}</Text>
            <Pressable accessibilityLabel="Close model picker" onPress={() => setOpen(false)} style={styles.closeButton}>
              <Feather name="x" size={20} color={tokens.text} />
            </Pressable>
          </View>
          {models.map((m) => (
            <Pressable
              key={m.key}
              onPress={async () => {
                // Never lose the model being switched away from: save
                // the current setup first (deduped by provider + model +
                // endpoint, so re-tapping the same model adds no row).
                // This is the bug the user hit on the old build, where
                // switching in this sheet overwrote the only copy of
                // the previous model and it could only be retyped.
                // Tapping the already-current row just re-saves it.
                // Exception: the old factory default (openai-compatible
                // + gpt-4o-mini + blank endpoint) is never auto-saved —
                // the user ordered no model of the app's own, so that
                // placeholder must not come back as a "Saved model".
                const current = await getUniversal();
                const isFactoryDefault = current.provider === 'openai-compatible' && current.model === 'gpt-4o-mini' && !current.endpoint.trim();
                if (!isFactoryDefault) {
                  await saveModelSetup({ provider: current.provider, model: current.model, endpoint: current.endpoint, contextWindow: current.contextWindow });
                }
                await m.apply(); setModel(m.id); setProvider(m.provider); setOpen(false);
              }}
              style={styles.row}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowText, m.id === model && styles.rowTextActive]} numberOfLines={1}>{m.id}</Text>
                <Text style={styles.rowDesc} numberOfLines={1}>{m.description}</Text>
              </View>
              {m.id === model ? <Feather name="check" size={18} color={tokens.text} /> : null}
            </Pressable>
          ))}
          <Pressable
            onPress={() => { setOpen(false); router.push('/model-setup' as never); }}
            style={styles.row}
          >
            <Feather name="cpu" size={18} color={tokens.text} />
            <View style={{ flex: 1 }}>
              <Text style={styles.rowText}>{t(language, 'modelSetup')}</Text>
              <Text style={styles.rowDesc} numberOfLines={1}>{t(language, 'modelSetupDesc')}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={tokens.text} />
          </Pressable>
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
