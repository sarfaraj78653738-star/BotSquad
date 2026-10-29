import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { AvatarPicker } from '../src/components/AvatarPicker';
import { MAIN_CHAT_AVATAR_DEFAULT } from '../src/lib/avatars';
import { getSetting, setSetting } from '../src/lib/db';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Main Chat avatar — its own page under Settings, so the Settings
// page itself stays short. Tapping an avatar saves it at once; Main
// Chat's header picks it up next time it is focused.
export default function MainAvatarScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [avatar, setAvatar] = useState(MAIN_CHAT_AVATAR_DEFAULT);

  useEffect(() => {
    getSetting('main_chat_avatar').then((v) => { if (v) setAvatar(v); }).catch(() => {});
  }, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>{t(language, 'settings')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t(language, 'mainAvatar')}</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        <Text style={styles.sub}>{t(language, 'pickAvatar')}</Text>
        <AvatarPicker value={avatar} onChange={async (id) => { setAvatar(id); await setSetting('main_chat_avatar', id); }} />
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  body: { flex: 1, padding: tokens.space.md },
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.md },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
