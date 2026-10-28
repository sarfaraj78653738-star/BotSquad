import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getUniversal, setUniversal, UniversalConfig } from '../lib/universal';
import { tokens } from '../lib/tokens';

// Compact model toggle for the chat composer. Shows the current
// universal model; tapping opens the models usable with the current
// provider, current model first. Selecting one changes only the model,
// never the provider.
const MODELS_BY_PROVIDER: Record<UniversalConfig['provider'], string[]> = {
  'openai-compatible': ['gpt-4o-mini', 'llama-3.3-70b-versatile', 'deepseek-chat', 'grok-4'],
  anthropic: ['claude-sonnet-4-5'],
  gemini: ['gemini-2.0-flash'],
};

export function ModelPicker() {
  const [model, setModel] = useState('gpt-4o-mini');
  const [provider, setProvider] = useState<UniversalConfig['provider']>('openai-compatible');
  const [open, setOpen] = useState(false);

  async function refresh() {
    try {
      const cfg = await getUniversal();
      setModel(cfg.model);
      setProvider(cfg.provider);
    } catch { /* keep last shown model */ }
  }

  useEffect(() => { refresh().catch(() => {}); }, []);

  const models = [model, ...MODELS_BY_PROVIDER[provider]].filter((m, i, arr) => arr.indexOf(m) === i);

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityLabel="Change model"
        accessibilityRole="button"
        onPress={async () => { if (!open) await refresh(); setOpen((v) => !v); }}
        style={styles.button}
      >
        <Text style={styles.buttonText} numberOfLines={1}>{model}</Text>
        <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={tokens.text} />
      </Pressable>
      {open && (
        <View style={styles.list}>
          {models.map((m) => (
            <Pressable
              key={m}
              onPress={async () => { await setUniversal({ model: m }); setModel(m); setOpen(false); }}
              style={styles.row}
            >
              <Text style={[styles.rowText, m === model && styles.rowTextActive]} numberOfLines={1}>{m}</Text>
              {m === model ? <Feather name="check" size={16} color={tokens.text} /> : null}
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  button: { alignItems: 'center', backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 4, height: 48, justifyContent: 'center', maxWidth: 150, paddingHorizontal: 10 },
  buttonText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '600', maxWidth: 110 },
  list: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, bottom: 56, left: 0, position: 'absolute', width: 230, zIndex: 50 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11 },
  rowText: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '600' },
  rowTextActive: { color: tokens.text, fontWeight: '700' },
  wrap: { position: 'relative' },
});
