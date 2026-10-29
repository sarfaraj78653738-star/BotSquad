import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLanguage, useTokens } from '../lib/tokens';
import { t } from '../lib/i18n';

// Attach (+) button. Tapping it opens a bottom sheet titled
// "Add to chat" with Camera, Photos, and Files. Picking an item does
// NOT upload it and does NOT read its contents — the caller only gets
// its name, size and kind, and sends a plain note about it.
export function AttachButton({ onAttachment, disabled, variant }: {
  onAttachment: (att: { name: string; size: number | null; kind: 'photo' | 'document' }) => void;
  disabled?: boolean;
  variant?: 'circle' | 'flat';
}) {
  const tokens = useTokens();
  const [language] = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = getStyles(tokens);
  const [open, setOpen] = useState(false);

  async function pickCamera() {
    setOpen(false);
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) return;
      const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (result.canceled) return;
      const asset = result.assets?.[0];
      if (!asset) return;
      const fallback = asset.uri.split('/').filter(Boolean).pop() ?? 'photo';
      onAttachment({ name: asset.fileName ?? fallback, size: asset.fileSize ?? null, kind: 'photo' });
    } catch {
      // Picker cancelled or failed: do nothing, no alert spam.
    }
  }

  async function pickPhoto() {
    setOpen(false);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
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
    setOpen(false);
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

  const options: { label: string; icon: React.ComponentProps<typeof Feather>['name']; onPress: () => void }[] = [
    { label: t(language, 'camera'), icon: 'camera', onPress: () => { void pickCamera(); } },
    { label: t(language, 'photos'), icon: 'image', onPress: () => { void pickPhoto(); } },
    { label: t(language, 'filesBack'), icon: 'file', onPress: () => { void pickDocument(); } },
  ];

  return (
    <View>
      <Pressable
        accessibilityLabel="Attach photo or document"
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setOpen(true)}
        style={[variant === 'flat' ? styles.flatBtn : styles.btn, disabled && styles.btnDisabled]}
      >
        <Feather name="plus" size={20} color={tokens.text} />
      </Pressable>
      <Modal animationType="slide" onRequestClose={() => setOpen(false)} transparent visible={open}>
        <Pressable accessibilityLabel="Close attach menu" onPress={() => setOpen(false)} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{t(language, 'addToChat')}</Text>
            <Pressable accessibilityLabel="Close attach menu" onPress={() => setOpen(false)} style={styles.closeButton}>
              <Feather name="x" size={20} color={tokens.text} />
            </Pressable>
          </View>
          {options.map((opt) => (
            <Pressable key={opt.label} onPress={opt.onPress} style={styles.row}>
              <Feather name={opt.icon} size={20} color={tokens.text} />
              <Text style={styles.rowText}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backdrop: { backgroundColor: tokens.scrim, flex: 1 },
  btn: { alignItems: 'center', backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: 999, borderWidth: 1, height: 48, justifyContent: 'center', width: 48 },
  btnDisabled: { opacity: 0.5 },
  closeButton: { padding: 6 },
  flatBtn: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  row: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 14 },
  rowText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: tokens.space.md, paddingBottom: 28 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
});
