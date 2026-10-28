import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { startVoice, VoiceError } from '../lib/voice';
import { tokens } from '../lib/tokens';

// Mic button for chat input. Partial results stream into onPartial, the
// final result goes to onFinal. It never invents text: if the native
// module is missing (Expo Go) or permission is denied, onError is called
// with a plain message and nothing is inserted into the input.
export function VoiceButton({ onPartial, onFinal, onError, disabled }: {
  onPartial: (t: string) => void;
  onFinal: (t: string) => void;
  onError: (m: string) => void;
  disabled?: boolean;
}) {
  const [listening, setListening] = useState(false);
  const stopRef = useRef<(() => Promise<void>) | null>(null);

  async function toggle() {
    if (listening) {
      setListening(false);
      await stopRef.current?.();
      stopRef.current = null;
      return;
    }
    try {
      stopRef.current = await startVoice(onPartial, onFinal, (m) => { setListening(false); onError(m); });
      setListening(true);
    } catch (e) {
      onError(e instanceof VoiceError ? e.message : 'Voice input failed. Type instead.');
    }
  }

  return (
    <Pressable
      accessibilityLabel={listening ? 'Stop listening' : 'Voice input'}
      accessibilityRole="button"
      disabled={disabled}
      onPress={toggle}
      style={[styles.btn, listening && styles.btnListening, disabled && styles.btnDisabled]}
    >
      <Text style={styles.text}>{listening ? '● Listening — tap to stop' : '🎤 Voice'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { backgroundColor: tokens.surfaceMuted, borderRadius: tokens.radius.md, marginBottom: tokens.space.sm, padding: 12 },
  btnDisabled: { opacity: 0.5 },
  btnListening: { backgroundColor: tokens.danger },
  text: { fontWeight: '700', textAlign: 'center' },
});
