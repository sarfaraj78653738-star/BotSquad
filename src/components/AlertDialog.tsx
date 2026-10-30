import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTokens } from '../lib/tokens';

// Themed in-app dialog, replacing React Native's Alert.alert wherever
// the app shows a prompt. Alert.alert renders the SYSTEM dialog,
// which ignores the app's own color mode — in dark mode it showed up
// white (bug 2026-10-30). This one uses the app's tokens, so it
// follows dark and light mode like every other screen.
export type AlertDialogButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

export function AlertDialog({ visible, title, message, buttons, onDismiss }: {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertDialogButton[];
  onDismiss?: () => void;
}) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  if (!visible) return null;
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onDismiss}>
      <View style={styles.backdrop}>
        <View style={styles.dialog}>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={styles.buttons}>
            {buttons.map((b) => (
              <Pressable
                key={b.text}
                accessibilityRole="button"
                onPress={() => { onDismiss?.(); b.onPress?.(); }}
                style={styles.button}
              >
                <Text style={[
                  styles.buttonText,
                  b.style === 'destructive' && styles.destructiveText,
                  b.style === 'cancel' && styles.cancelText,
                ]}>
                  {b.text}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: tokens.scrim, flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  dialog: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 16, borderWidth: 1, padding: 20, width: '100%' },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  message: { color: tokens.textMuted, fontSize: tokens.font.md, lineHeight: 22, marginTop: 8 },
  buttons: { flexDirection: 'row', gap: 20, justifyContent: 'flex-end', marginTop: 20 },
  button: { paddingVertical: 4 },
  buttonText: { color: tokens.accent, fontSize: tokens.font.md, fontWeight: '700' },
  destructiveText: { color: tokens.danger },
  cancelText: { color: tokens.textMuted },
});
