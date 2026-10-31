import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ADS_ENABLED } from '../lib/ads';
import { useTokens } from '../lib/tokens';

export function Button({ title, onPress, variant = 'primary', disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, variant === 'secondary' && styles.buttonSecondary, variant === 'danger' && styles.buttonDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary, variant === 'danger' && styles.buttonTextDanger]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, multiline, placeholder, secure }: { label: string; value: string; onChangeText: (t: string) => void; multiline?: boolean; placeholder?: string; secure?: boolean }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.textMuted}
        secureTextEntry={secure}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return <View style={styles.card}>{children}</View>;
}

// Avatar shows the bot's initial letter on a soft tint of its stored
// colour. The stored geometric icon value is intentionally not rendered.
export function Avatar({ color, icon, label, size = 44 }: { color: string; icon?: string; label?: string; size?: number }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const initial = (label ?? '').trim().charAt(0).toUpperCase() || 'T';
  const bg = color.length === 7 ? `${color}2E` : color;
  return (
    <View style={[styles.avatar, { backgroundColor: bg, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[styles.avatarText, { fontSize: Math.round(size * 0.4) }]}>{initial}</Text>
    </View>
  );
}

export function Chip({ label }: { label: string }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

export function CheckBox({ selected, label }: { selected: boolean; label?: string }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <View style={styles.checkRow}>
      <View style={[styles.checkBox, selected && styles.checkBoxSelected]}>
        {selected ? <Feather name="check" size={14} color={tokens.onAccent} /> : null}
      </View>
      {label ? <Text style={styles.checkLabel}>{label}</Text> : null}
    </View>
  );
}

// Placeholder ad slot: gated off in GitHub v1 (ADS_ENABLED = false).
// TODO: replace with a real AdMob banner/interstitial before any release
// that actually shows ads.
export function AdSlot({ visible }: { visible: boolean }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  if (!visible || !ADS_ENABLED) return null;
  return (
    <View accessibilityLabel="Advertisement placeholder" style={styles.ad}>
      <Text style={styles.adText}>Ad — placeholder (AdMob TODO)</Text>
      <Text style={styles.adSub}>Remove Ads in Settings to hide this slot. Ads never lock a feature.</Text>
    </View>
  );
}

export function LoadingRow({ label, onStopAds }: { label: string; onStopAds?: () => void }) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={tokens.textMuted} />
      <Text style={styles.loadingText}>{label}</Text>
      {onStopAds ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Stop ads" onPress={onStopAds} style={styles.stopAds}>
          <Text style={styles.stopAdsText}>Stop ads</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function useToggle(initial = false) {
  const [v, setV] = useState(initial);
  return [v, () => setV(!v)] as const;
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  ad: { backgroundColor: tokens.accentSoft, borderRadius: tokens.radius.md, marginVertical: tokens.space.sm, padding: tokens.space.md },
  adSub: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 4 },
  adText: { color: tokens.text, fontWeight: '700' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: tokens.text, fontWeight: '700' },
  button: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.lg, paddingVertical: 14 },
  buttonDanger: { backgroundColor: tokens.surfaceMuted, borderColor: tokens.border, borderWidth: 1 },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: { backgroundColor: tokens.surface, borderColor: tokens.border, borderWidth: 1 },
  buttonText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700', textAlign: 'center' },
  buttonTextDanger: { color: tokens.danger },
  buttonTextSecondary: { color: tokens.text },
  card: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.lg, borderWidth: 1, marginBottom: 12, padding: 18 },
  checkBox: { alignItems: 'center', borderColor: tokens.border, borderRadius: 6, borderWidth: 1.5, height: 22, justifyContent: 'center', width: 22 },
  checkBoxSelected: { backgroundColor: tokens.accent, borderColor: tokens.accent },
  checkLabel: { color: tokens.text, fontSize: tokens.font.md },
  checkRow: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  chip: { backgroundColor: tokens.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { color: tokens.text, fontSize: 13, fontWeight: '700' },
  field: { marginBottom: 14 },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, padding: 14 },
  inputMultiline: { minHeight: 88, textAlignVertical: 'top' },
  label: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700', marginBottom: 6 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: tokens.space.sm },
  loadingText: { color: tokens.textMuted, fontSize: tokens.font.md },
  stopAds: { marginLeft: 'auto', padding: 4 },
  stopAdsText: { color: tokens.accent, fontSize: tokens.font.sm, fontWeight: '700' },
});
