import { useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { listProjects, Project } from '../lib/projects';
import { useLanguage, useTokens } from '../lib/tokens';
import { t } from '../lib/i18n';

// Chat thread menu, opened from the header three-dot button — the
// same set the user pointed at: Share, Rename, Pin/Unpin, Add to
// project, Add to home, Export ZIP, Delete. It only ever appears for
// a thread that already has messages (a fresh empty chat shows no
// header actions at all). Delete asks for confirmation first and
// deletes only this thread. Add to home is an Android home-screen
// shortcut to this exact thread (handled by the caller); Pin only
// moves the thread to the top of History.
export type ThreadMenuTarget = { kind: 'main' | 'bot' | 'group'; id: string; title: string; transcript: string };

export function ThreadMenu({ visible, onClose, target, pinned, onRename, onTogglePin, onAddToProject, onAddToHome, onExportZip, onDelete }: {
  visible: boolean;
  onClose: () => void;
  target: ThreadMenuTarget;
  pinned: boolean;
  onRename: (name: string) => Promise<void>;
  onTogglePin: () => Promise<void>;
  onAddToProject: (projectId: string) => Promise<void>;
  onAddToHome: () => Promise<'added' | 'unavailable' | 'failed'>;
  onExportZip: () => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const tokens = useTokens();
  const [language] = useLanguage();
  const insets = useSafeAreaInsets();
  const styles = getStyles(tokens);
  const [view, setView] = useState<'menu' | 'rename' | 'projects'>('menu');
  const [name, setName] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [busy, setBusy] = useState('');

  function close() { setView('menu'); setName(''); onClose(); }

  async function share() {
    const text = target.transcript.trim();
    close();
    if (!text) return;
    try { await Share.share({ message: text }); } catch { /* dismissed */ }
  }

  function row(icon: React.ComponentProps<typeof Feather>['name'], label: string, onPress: () => void, danger = false) {
    return (
      <Pressable onPress={onPress} style={styles.row}>
        <Feather name={icon} size={20} color={danger ? tokens.danger : tokens.text} />
        <Text style={[styles.rowText, danger && { color: tokens.danger }]}>{label}</Text>
      </Pressable>
    );
  }

  return (
    <Modal animationType="slide" onRequestClose={close} transparent visible={visible}>
      <Pressable accessibilityLabel="Close menu" onPress={close} style={styles.backdrop} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 28 }]}>
        <View style={styles.sheetHead}>
          <Text style={styles.sheetTitle} numberOfLines={1}>{target.title}</Text>
          <Pressable accessibilityLabel="Close menu" onPress={close} style={styles.closeButton}>
            <Feather name="x" size={20} color={tokens.text} />
          </Pressable>
        </View>
        {view === 'menu' && (<>
          {row('share-2', t(language, 'share'), share)}
          {row('edit-3', t(language, 'rename'), () => { setName(target.title); setView('rename'); })}
          {row(pinned ? 'x-circle' : 'bookmark', pinned ? t(language, 'unpin') : t(language, 'pin'), async () => { await onTogglePin(); close(); })}
          {row('folder-plus', t(language, 'addToProject'), async () => { setProjects(await listProjects().catch(() => [])); setView('projects'); })}
          {row('home', t(language, 'addToHome'), async () => {
            setBusy('home');
            const result = await onAddToHome();
            setBusy('');
            close();
            if (result === 'added') Alert.alert(t(language, 'shortcutRequested'), t(language, 'shortcutConfirm'));
            else if (result === 'unavailable') Alert.alert(t(language, 'notAvailable'), t(language, 'shortcutsUnavailable'));
            else Alert.alert(t(language, 'couldNotAdd'), t(language, 'shortcutFailed'));
          })}
          {row('download', t(language, 'exportZip'), async () => { close(); await onExportZip(); })}
          {row('trash-2', t(language, 'delete'), () => {
            Alert.alert(t(language, 'deleteChatTitle'), t(language, 'deleteChatBody'), [
              { text: t(language, 'cancel'), style: 'cancel' },
              { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await onDelete(); close(); } },
            ]);
          }, true)}
          {busy ? <Text style={styles.sub}>{t(language, 'working')}</Text> : null}
        </>)}
        {view === 'rename' && (
          <View>
            <TextInput accessibilityLabel="Chat name" value={name} onChangeText={setName} placeholder={t(language, 'chatName')} placeholderTextColor={tokens.textMuted} style={styles.input} />
            <Pressable onPress={async () => { const t = name.trim(); if (t) await onRename(t); close(); }} style={styles.saveButton}>
              <Text style={styles.saveText}>{t(language, 'saveName')}</Text>
            </Pressable>
            <Pressable onPress={() => setView('menu')} style={styles.backButton}>
              <Text style={styles.backText}>{t(language, 'back')}</Text>
            </Pressable>
          </View>
        )}
        {view === 'projects' && (
          <View>
            {projects.length === 0 && <Text style={styles.sub}>{t(language, 'noProjectsFirst')}</Text>}
            {projects.map((p) => (
              <Pressable key={p.id} onPress={async () => { await onAddToProject(p.id); close(); Alert.alert(t(language, 'addedToProject'), `"${target.title}" ${t(language, 'isNowLinkedTo')} ${p.name}.`); }} style={styles.row}>
                <Feather name="folder" size={20} color={tokens.text} />
                <Text style={styles.rowText}>{p.name}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setView('menu')} style={styles.backButton}>
              <Text style={styles.backText}>{t(language, 'back')}</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backdrop: { backgroundColor: tokens.scrim, flex: 1 },
  backButton: { alignItems: 'center', paddingVertical: 12 },
  backText: { color: tokens.textMuted, fontSize: tokens.font.md, fontWeight: '600' },
  closeButton: { padding: 6 },
  input: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: 12, padding: 14 },
  row: { alignItems: 'center', borderTopColor: tokens.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingVertical: 13 },
  rowText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  saveButton: { alignItems: 'center', backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingVertical: 13 },
  saveText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  sheet: { backgroundColor: tokens.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: tokens.space.md, paddingBottom: 28 },
  sheetHead: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sheetTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, paddingVertical: 8 },
});
