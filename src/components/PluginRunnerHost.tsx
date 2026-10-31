import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PLUGIN_RUNNER_HTML, handlePageMessage, registerPluginHostReset, setPluginReady, setPluginTransport } from '../lib/pluginRunner';

// The plugin sandbox host: one hidden WebView, mounted once at the
// app root. It carries no UI (1x1, transparent) and holds no app
// data — it is only the transport between pluginRunner.ts and the
// sandbox page. Plugin code runs inside this WebView's engine, never
// in the app's own runtime.
// Per-run reset (fix 2026-11-01): before each run, pluginRunner
// asks this host to remount (key change), so every run starts on a
// fresh blank page and the previous run's listeners die with the old
// WebView. Navigation away from the sandbox page is blocked — the
// only URL allowed is the initial about:blank load.
export function PluginRunnerHost() {
  const ref = useRef<WebView>(null);
  const [resetKey, setResetKey] = useState(0);
  useEffect(() => {
    registerPluginHostReset(() => { setResetKey((k) => k + 1); });
    return () => {
      registerPluginHostReset(null);
      setPluginTransport(null);
    };
  }, []);
  return (
    <View style={{ width: 1, height: 1, opacity: 0 }} pointerEvents="none">
      <WebView
        key={resetKey}
        ref={ref}
        originWhitelist={['*']}
        source={{ html: PLUGIN_RUNNER_HTML }}
        javaScriptEnabled
        onShouldStartLoadWithRequest={(request) => request.url === 'about:blank'}
        onLoadEnd={() => {
          setPluginTransport({ post: (msg: string) => { ref.current?.postMessage(msg); } });
          setPluginReady();
        }}
        onMessage={(e) => { void handlePageMessage(e.nativeEvent.data); }}
      />
    </View>
  );
}
