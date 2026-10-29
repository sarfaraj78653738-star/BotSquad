import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MenuButton } from '../../src/components/Drawer';
import { ChatView } from '../../src/components/ChatView';
import { BotAvatar } from '../../src/components/BotAvatar';
import { avatarFor } from '../../src/lib/avatars';
import { useTokens } from '../../src/lib/tokens';

// A single bot's chat, reached from Bots or History. It reuses the same
// ChatView as Main Chat. Its header follows the same pattern as the
// Group thread header: NO Back button — the left control is the drawer
// menu, so the user can switch anywhere from inside a chat, and
// "+ New" opens the new-bot form (the Bots section's create screen).
// The bot's user-picked avatar shows next to its name; ChatView's
// thread menu arrives on the right once the chat has messages.
export default function BotChatScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (!id) return <View style={styles.wrap}><Text style={styles.sub}>Loading chat…</Text></View>;
  return (
    <ChatView
      botId={id}
      topBar={(bot, actions) => (
        <View style={styles.header}>
          <MenuButton />
          <View style={styles.titleRow}>
            {bot ? <BotAvatar variant={avatarFor(bot.id, bot.avatar)} size={32} /> : null}
            <Text style={styles.headerTitle} numberOfLines={1}>{bot ? bot.name : 'Chat'}</Text>
          </View>
          <View style={styles.rightRow}>
            <Pressable
              accessibilityLabel="Create a new bot"
              onPress={() => router.push('/bot/new' as never)}
              style={styles.newButton}
            >
              <Text style={styles.newText}>+ New</Text>
            </Pressable>
            {actions}
          </View>
        </View>
      )}
    />
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  newButton: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  newText: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  rightRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md },
  titleRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
