import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { MenuButton } from '../src/components/Drawer';
import { ChatView } from '../src/components/ChatView';
import { BotAvatar } from '../src/components/BotAvatar';
import { avatarFor, MAIN_CHAT_AVATAR_DEFAULT } from '../src/lib/avatars';
import { getSetting } from '../src/lib/db';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

// Main Chat — the app's opening screen. It is universal, not tied to
// any bot: it works immediately with zero bots. Opening the app shows
// the current thread; History can open an older thread by passing its
// chatId, which then becomes the current thread again. The header
// shows the user-picked Main Chat avatar (Settings) next to the
// title, and ChatView's header actions (Export, New chat, menu) on
// the right — only once the thread has messages.
export default function MainChatScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const params = useLocalSearchParams();
  const chatIdParam = typeof params.chatId === 'string' ? params.chatId : undefined;
  const [mainAvatar, setMainAvatar] = useState(MAIN_CHAT_AVATAR_DEFAULT);
  const refreshAvatar = useCallback(() => {
    getSetting('main_chat_avatar').then((v) => { if (v) setMainAvatar(v); }).catch(() => {});
  }, []);
  useFocusEffect(refreshAvatar);
  return (
    <ChatView
      universal
      universalChatId={chatIdParam}
      topBar={(bot, actions) => (
        <View style={styles.header}>
          <MenuButton />
          <View style={styles.titleRow}>
            <BotAvatar variant={avatarFor('main-chat', mainAvatar)} size={32} />
            <Text style={styles.headerTitle} numberOfLines={1}>{bot?.name ?? t(language, 'mainChat')}</Text>
          </View>
          {actions ?? <View style={{ width: 34 }} />}
        </View>
      )}
    />
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
});
