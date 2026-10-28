import { StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { MenuButton } from '../src/components/Drawer';
import { ChatView } from '../src/components/ChatView';
import { useTokens } from '../src/lib/tokens';

// Main Chat — the app's opening screen. It is universal, not tied to
// any bot: it works immediately with zero bots. Opening the app shows
// the current thread; History can open an older thread by passing its
// chatId, which then becomes the current thread again.
export default function MainChatScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const params = useLocalSearchParams();
  const chatIdParam = typeof params.chatId === 'string' ? params.chatId : undefined;
  return (
    <ChatView
      universal
      universalChatId={chatIdParam}
      topBar={() => (
        <View style={styles.header}>
          <MenuButton />
          <Text style={styles.headerTitle}>Main Chat</Text>
          <View style={{ width: 34 }} />
        </View>
      )}
    />
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
});
