import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Button, Card, Field } from '../src/components/ui';
import { getSetting, setSetting } from '../src/lib/db';
import { useTokens } from '../src/lib/tokens';

// Profile — local only. There is no login and no account in Phase 1, so
// there is deliberately no Delete Account button, no billing row, and no
// account row here: deleting an "account" would mean wiping local data,
// which was not ordered. Everything on this page stays on the device:
// names and preferences live in local storage, the photo is a local
// file URI, and nothing here is uploaded anywhere. The only place
// profile data leaves the device is inside a chat prompt the user
// already sends to their own chosen provider (see prompt.ts).
export default function ProfileScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [callName, setCallName] = useState('');
  const [preferences, setPreferences] = useState('');
  const [photoUri, setPhotoUri] = useState('');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      setFullName((await getSetting('profile_full_name')) ?? '');
      setCallName((await getSetting('profile_call_name')) ?? '');
      setPreferences((await getSetting('profile_preferences')) ?? '');
      setPhotoUri((await getSetting('profile_photo_uri')) ?? '');
    })().catch(() => {});
  }, []);

  const initial = (callName.trim() || fullName.trim()).charAt(0).toUpperCase();

  async function editPhoto() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled || !result.assets[0]) return;
    const uri = result.assets[0].uri;
    setPhotoUri(uri);
    await setSetting('profile_photo_uri', uri);
    setMsg('Photo saved on this device only.');
  }

  async function saveProfile() {
    await setSetting('profile_full_name', fullName.trim());
    await setSetting('profile_call_name', callName.trim());
    setMsg('Profile saved.');
  }

  async function savePreferences() {
    await setSetting('profile_preferences', preferences.trim());
    setMsg('Preferences saved. They will be considered in every chat.');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        <View style={styles.avatarBlock}>
          <View style={styles.avatar}>
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={styles.avatarImage} />
            ) : initial ? (
              <Text style={styles.avatarText}>{initial}</Text>
            ) : (
              <Feather name="user" size={36} color={tokens.textMuted} />
            )}
          </View>
          <Pressable accessibilityLabel="Edit photo" onPress={editPhoto}>
            <Text style={styles.editPhoto}>Edit Photo</Text>
          </Pressable>
        </View>
        <Card>
          <Field label="Full name" onChangeText={setFullName} value={fullName} />
          <Field label="What should we call you?" onChangeText={setCallName} value={callName} />
          <Button title="Update Profile" onPress={saveProfile} />
        </Card>
        <Text style={styles.sectionTitle}>What personal preferences should the bots consider in responses?</Text>
        <Text style={styles.sub}>These preferences apply to all conversations.</Text>
        <Card>
          <Field label="Personal preferences" multiline onChangeText={setPreferences} value={preferences} />
          <Button title="Save Preferences" onPress={savePreferences} />
        </Card>
        {msg ? <Card><Text style={styles.sub}>{msg}</Text></Card> : null}
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  avatar: { alignItems: 'center', backgroundColor: tokens.surfaceMuted, borderColor: tokens.border, borderRadius: 48, borderWidth: 1, height: 96, justifyContent: 'center', overflow: 'hidden', width: 96 },
  avatarBlock: { alignItems: 'center', gap: 10, marginBottom: tokens.space.md },
  avatarImage: { height: 96, width: 96 },
  avatarText: { color: tokens.text, fontSize: 36, fontWeight: '800' },
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  editPhoto: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 8 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
