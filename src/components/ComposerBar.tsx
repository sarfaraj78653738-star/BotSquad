import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { AttachButton } from './AttachButton';
import { ModelPicker } from './ModelPicker';
import { VoiceButton } from './VoiceButton';
import { useTokens } from '../lib/tokens';

// One wide composer bar, shared by Main Chat, bot chats, and group
// chat. Layout inside the single bar, top to bottom:
//   Row 1: the text input, full width on its own line (multiline,
//          grows with text, never squeezed by side buttons).
//   Row 2: attach (+), model pill, then mic and send on the right.
// Nothing floats outside the bar, so the input can never wrap a short
// placeholder into two lines at normal phone width.
export function ComposerBar({ input, onChangeText, placeholder, loading, onSend, onAttachment, onVoicePartial, onVoiceFinal, onVoiceError }: {
  input: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  loading?: boolean;
  onSend: () => void;
  onAttachment: (att: { name: string; size: number | null; kind: 'photo' | 'document' }) => void;
  onVoicePartial: (t: string) => void;
  onVoiceFinal: (t: string) => void;
  onVoiceError: (m: string) => void;
}) {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  return (
    <View style={styles.bar}>
      <TextInput
        accessibilityLabel="Message"
        multiline
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={tokens.textMuted}
        style={styles.input}
        value={input}
      />
      <View style={styles.actions}>
        <AttachButton onAttachment={onAttachment} disabled={loading} variant="flat" />
        <ModelPicker />
        <View style={{ flex: 1 }} />
        <VoiceButton
          disabled={loading}
          variant="flat"
          onPartial={onVoicePartial}
          onFinal={onVoiceFinal}
          onError={onVoiceError}
        />
        <Pressable
          accessibilityLabel="Send message"
          disabled={loading}
          onPress={onSend}
          style={[styles.sendButton, loading && styles.sendDisabled]}
        >
          <Feather name="send" size={18} color={tokens.onAccent} />
        </Pressable>
      </View>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  actions: { alignItems: 'center', flexDirection: 'row', gap: 4, marginTop: 4 },
  bar: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.lg, borderWidth: 1, marginTop: 8, paddingHorizontal: 12, paddingVertical: 10 },
  input: { color: tokens.text, fontSize: tokens.font.md, lineHeight: 22, maxHeight: 160, minHeight: 44, paddingHorizontal: 4, paddingVertical: 8 },
  sendButton: { alignItems: 'center', backgroundColor: tokens.accent, borderRadius: 999, height: 40, justifyContent: 'center', width: 40 },
  sendDisabled: { opacity: 0.5 },
});
