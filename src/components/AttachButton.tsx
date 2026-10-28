import { Alert, Pressable, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { tokens } from '../lib/tokens';

// Attach button for the group composer. Picking a file does NOT upload
// it and does NOT read its contents — the caller only gets its name,
// size and kind, and sends a plain note about the attachment.
export function AttachButton({ onAttachment, disabled }: {
  onAttachment: (att: { name: string; size: number | null; kind: 'photo' | 'document' }) => void;
  disabled?: boolean;
}) {
  async function pickPhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const uri = asset.uri ?? '';
      const fallback = uri.split('/').filter(Boolean).pop() ?? 'photo';
      onAttachment({ name: asset.fileName ?? fallback, size: asset.fileSize ?? null, kind: 'photo' });
    } catch {
      // Picker cancelled or failed: do nothing, no alert spam.
    }
  }

  async function pickDocument() {
    try {
      const result = await DocumentPicker.getDocumentAsync({});
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const fallback = asset.uri.split('/').filter(Boolean).pop() ?? 'document';
      onAttachment({ name: asset.name ?? fallback, size: asset.size ?? null, kind: 'document' });
    } catch {
      // Picker cancelled or failed: do nothing, no alert spam.
    }
  }

  function offer() {
    Alert.alert('Attach', undefined, [
      { text: 'Photo', onPress: () => { void pickPhoto(); } },
      { text: 'Document', onPress: () => { void pickDocument(); } },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  return (
    <Pressable
      accessibilityLabel="Attach photo or document"
      accessibilityRole="button"
      disabled={disabled}
      onPress={offer}
      style={[styles.btn, disabled && styles.btnDisabled]}
    >
      <Feather name="plus" size={20} color={tokens.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { alignItems: 'center', backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  btnDisabled: { opacity: 0.5 },
});
