import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AVATAR_VARIANTS } from '../lib/avatars';
import { useTokens } from '../lib/tokens';
import { BotAvatar } from './BotAvatar';

// Avatar picker grid: the user picks one cute avatar per bot, and one
// for Main Chat. Nothing is picked for them — the selected variant is
// the one they tapped, shown with a ring.
export function AvatarPicker({ value, onChange }: { value: string | undefined; onChange: (id: string) => void }) {
  const tokens = useTokens();
  const styles = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    cell: { alignItems: 'center', gap: 4 },
    ring: { borderColor: tokens.accent, borderRadius: 999, borderWidth: 2, padding: 3 },
    name: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '600' },
    nameActive: { color: tokens.text, fontWeight: '700' },
  });
  return (
    <View style={styles.grid}>
      {AVATAR_VARIANTS.map((v) => {
        const selected = value === v.id;
        return (
          <Pressable key={v.id} accessibilityLabel={`Avatar ${v.name}`} accessibilityRole="button" onPress={() => onChange(v.id)} style={styles.cell}>
            <View style={selected ? styles.ring : { padding: 3 }}>
              <BotAvatar variant={v} size={56} />
            </View>
            <Text style={[styles.name, selected && styles.nameActive]}>{v.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
