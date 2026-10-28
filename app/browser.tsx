import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Button, Field } from '../src/components/ui';
import { tokens } from '../src/lib/tokens';

export default function BrowserScreen() {
  const router = useRouter();
  const [url, setUrl] = useState('https://example.com');
  const [current, setCurrent] = useState('https://example.com');
  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Browser</Text>
        <View style={{ width: 84 }} />
      </View>
      <View style={styles.body}>

      <Field label="URL" onChangeText={setUrl} placeholder="https://example.com" value={url} />
      <Button title="Open page" onPress={() => setCurrent(url.startsWith('http') ? url : `https://${url}`)} />
      <View style={styles.web}>
        <WebView
          source={{ uri: current }}
          // SECURITY FIX 2026-10-28: harden the in-app WebView. There is no
          // JS/native bridge in this app, and these settings keep it that
          // way: no file access, no universal file access, no popups, and
          // only http(s) navigation is allowed (custom schemes, file://,
          // javascript: etc. are blocked at navigation time).
          originWhitelist={['https://*', 'http://*']}
          javaScriptCanOpenWindowsAutomatically={false}
          mediaPlaybackRequiresUserAction
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          onShouldStartLoadWithRequest={(req) => /^https?:\/\//i.test(req.url)}
        />
      </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  web: { flex: 1, marginTop: tokens.space.md },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
