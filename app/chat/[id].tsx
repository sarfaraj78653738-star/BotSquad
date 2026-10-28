import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { ChatView } from '../../src/components/ChatView';
import { tokens } from '../../src/lib/tokens';

// A single bot's chat, reached from Bots or History. It reuses the same
// ChatView as Main Chat; only its header differs (back button + name).
export default function BotChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  if (!id) return <View style={styles.wrap}><Text style={styles.sub}>Loading chat…</Text></View>;
  return (
    <ChatView
      botId={id}
      topBar={(bot) => (
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Back"
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}
            style={styles.backButton}
          >
            <Feather name="chevron-left" size={22} color={tokens.text} />
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{bot ? bot.name : 'Chat'}</Text>
          <View style={{ width: 68 }} />
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  backButton: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
