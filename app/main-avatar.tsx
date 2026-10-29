import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MenuButton } from '../src/components/Drawer';
import { AvatarPicker } from '../src/components/AvatarPicker';
import { MAIN_CHAT_AVATAR_DEFAULT } from '../src/lib/avatars';
import { getSetting, setSetting } from '../src/lib/db';
import { useTokens } from '../src/lib/tokens';

// Main Chat avatar — its own page under Settings, so the Settings
// page itself stays short. Tapping an avatar saves it at once; Main
// Chat's header picks it up next time it is focused.
export default function MainAvatarScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const [avatar, setAvatar] = useState(MAIN_CHAT_AVATAR_DEFAULT);

  useEffect(() => {
    getSetting('main_chat_avatar').then((v) => { if (v) setAvatar(v); }).catch(() => {});
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <MenuButton />
        <Text style={styles.headerTitle}>Main Chat avatar</Text>
        <View style={{ width: 34 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.sub}>Pick the avatar for Main Chat. Each bot has its own pick on its edit screen.</Text>
        <AvatarPicker value={avatar} onChange={async (id) => { setAvatar(id); await setSetting('main_chat_avatar', id); }} />
        <Text style={styles.note}>Saved at once. Open Main Chat to see it in the header.</Text>
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  body: { flex: 1, padding: tokens.space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.md },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
