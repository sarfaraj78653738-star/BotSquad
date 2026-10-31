import { useRef } from 'react';
import { View } from 'react-native';
import { WebView } from 'react-native-webview';
import { PLUGIN_RUNNER_HTML, handlePageMessage, setPluginReady, setPluginTransport } from '../lib/pluginRunner';

// The plugin sandbox host: one hidden WebView, mounted once at the
// app root. It carries no UI (1x1, transparent) and holds no app
// data — it is only the transport between pluginRunner.ts and the
// sandbox page. Plugin code runs inside this WebView's engine, never
// in the app's own runtime.
export function PluginRunnerHost() {
  const ref = useRef<WebView>(null);
  return (
    <View style={{ width: 1, height: 1, opacity: 0 }} pointerEvents="none">
      <WebView
        ref={ref}
        originWhitelist={['*']}
        source={{ html: PLUGIN_RUNNER_HTML }}
        javaScriptEnabled
        onLoadEnd={() => {
          setPluginTransport({ post: (msg: string) => { ref.current?.postMessage(msg); } });
          setPluginReady();
        }}
        onMessage={(e) => { void handlePageMessage(e.nativeEvent.data); }}
      />
    </View>
  );
}
