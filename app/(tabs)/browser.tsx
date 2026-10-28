import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { Button, Field } from '../../src/components/ui';
import { tokens } from '../../src/lib/tokens';

export default function BrowserScreen() {
  const [url, setUrl] = useState('https://example.com');
  const [current, setCurrent] = useState('https://example.com');
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Browser</Text>
      <Text style={styles.sub}>Open a public page inside the app. No sign-in, no password saving, no paywall bypass.</Text>
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
  );
}

const styles = StyleSheet.create({
  sub: { color: tokens.textMuted, marginBottom: tokens.space.sm },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 4 },
  web: { flex: 1, marginTop: tokens.space.md },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
