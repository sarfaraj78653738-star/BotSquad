import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { ADS_ENABLED } from '../lib/ads';
import { tokens } from '../lib/tokens';

export function Button({ title, onPress, variant = 'primary', disabled }: { title: string; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.button, variant === 'secondary' && styles.buttonSecondary, variant === 'danger' && styles.buttonDanger, disabled && styles.buttonDisabled]}
    >
      <Text style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, value, onChangeText, multiline, placeholder, secure }: { label: string; value: string; onChangeText: (t: string) => void; multiline?: boolean; placeholder?: string; secure?: boolean }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        secureTextEntry={secure}
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
      />
    </View>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Avatar({ color, icon, size = 44 }: { color: string; icon: string; size?: number }) {
  return (
    <View style={[styles.avatar, { backgroundColor: color, width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={styles.avatarText}>{icon}</Text>
    </View>
  );
}

// Placeholder ad slot: gated off in GitHub v1 (ADS_ENABLED = false).
// TODO: replace with a real AdMob banner/interstitial before any release
// that actually shows ads.
export function AdSlot({ visible }: { visible: boolean }) {
  if (!visible || !ADS_ENABLED) return null;
  return (
    <View accessibilityLabel="Advertisement placeholder" style={styles.ad}>
      <Text style={styles.adText}>Ad — placeholder (AdMob TODO)</Text>
      <Text style={styles.adSub}>Remove Ads in Settings to hide this slot. Ads never lock a feature.</Text>
    </View>
  );
}

export function LoadingRow({ label }: { label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator />
      <Text style={styles.loadingText}>{label}</Text>
    </View>
  );
}

export function useToggle(initial = false) {
  const [v, setV] = useState(initial);
  return [v, () => setV(!v)] as const;
}

const styles = StyleSheet.create({
  ad: { backgroundColor: tokens.accentSoft, borderRadius: tokens.radius.md, marginVertical: tokens.space.sm, padding: tokens.space.md },
  adSub: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 4 },
  adText: { color: tokens.text, fontWeight: '700' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: tokens.onAccent, fontSize: 18, fontWeight: '800' },
  button: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: tokens.space.lg, paddingVertical: 12 },
  buttonDanger: { backgroundColor: tokens.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: { backgroundColor: tokens.surfaceMuted },
  buttonText: { color: tokens.onAccent, fontWeight: '700', textAlign: 'center' },
  buttonTextSecondary: { color: tokens.text },
  card: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginBottom: tokens.space.sm, padding: tokens.space.md },
  field: { marginBottom: tokens.space.sm },
  input: { borderColor: tokens.border, borderRadius: tokens.radius.sm, borderWidth: 1, padding: tokens.space.sm },
  inputMultiline: { minHeight: 72, textAlignVertical: 'top' },
  label: { color: tokens.text, fontWeight: '700', marginBottom: 4 },
  loading: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingVertical: tokens.space.sm },
  loadingText: { color: tokens.textMuted },
});
