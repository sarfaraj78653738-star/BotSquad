import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import WebView from 'react-native-webview';
import { Button } from './ui';
import { useLanguage, useTokens } from '../lib/tokens';
import { t } from '../lib/i18n';
import {
  BrowserAction, isLoginOrCaptchaPage, isSensitiveField, jsString, normalizeBrowserUrl,
} from '../lib/liveBrowser';

// Live in-chat browser panel. One WebView instance, kept mounted while
// the panel is open so expanding it never reloads the page.
// Control modes:
// - "bot": the bot's allowlisted actions run (navigate/back/forward/
//   reload/scroll directly; tap/type only after user approval below).
// - "user": the bot is paused; the user touches the WebView directly.
// Take Control switches bot -> user. Hand over switches user -> bot
// and resumes from the CURRENT page URL, never from scratch.
// Login/CAPTCHA rule: the bot never types a password, never signs in,
// never bypasses a paywall or CAPTCHA. On a login or check page the
// panel pauses the bot and hands control to the user automatically.
// Security: the only JS bridge traffic is a small boolean result
// (tap/type succeeded or not) posted back by injected code. No keys,
// no local data, and no page content are ever sent to native code,
// and injected code never receives anything except the short search
// text of the action the user already approved.

export type LiveBrowserHandle = {
  open: (url?: string) => void;
  requestAction: (action: BrowserAction) => void;
};

type Props = {
  botName: string;
  onExpandedChange?: (expanded: boolean) => void;
};

const MAX_LOG = 30;

const LiveBrowserPanel = forwardRef<LiveBrowserHandle, Props>(function LiveBrowserPanel({ botName, onExpandedChange }, ref) {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const webRef = useRef<WebView>(null);
  const [open, setOpen] = useState(false);
  const [currentUrl, setCurrentUrl] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [mode, setMode] = useState<'bot' | 'user'>('bot');
  const [expanded, setExpanded] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [pending, setPending] = useState<BrowserAction | null>(null);
  const [canBack, setCanBack] = useState(false);
  const [canForward, setCanForward] = useState(false);
  const modeRef = useRef<'bot' | 'user'>('bot');
  const pendingRef = useRef<BrowserAction | null>(null);

  function pushLog(line: string) {
    setLog((prev) => [...prev.slice(-(MAX_LOG - 1)), line]);
  }

  function setModeBoth(m: 'bot' | 'user') {
    modeRef.current = m;
    setMode(m);
  }

  function setExpandedBoth(v: boolean) {
    setExpanded(v);
    onExpandedChange?.(v);
  }

  function describe(a: BrowserAction): string {
    switch (a.kind) {
      case 'navigate': return `${t(language, 'logOpened')} ${hostnameOf(a.url)}`;
      case 'back': return t(language, 'describeBack');
      case 'forward': return t(language, 'describeForward');
      case 'reload': return t(language, 'describeReload');
      case 'scroll': return `${t(language, 'describeScrolled')} ${a.direction === 'down' ? t(language, 'scrollDown') : t(language, 'scrollUp')}`;
      case 'tap': return `${t(language, 'describeTapped')} "${a.text}"`;
      // The approval shows exactly what will be typed (fix 2026-11-01
      // — the card previously showed only the field name, so
      // model-held sensitive text could be typed into an attacker
      // page's field unseen): value truncated to ~200 chars plus its
      // total length, so a long value is never silently hidden.
      case 'type': return `${t(language, 'describeTyped')} "${a.field}": "${a.value.slice(0, 200)}${a.value.length > 200 ? '…' : ''}" (${a.value.length} chars)`;
    }
  }

  function openPanel(url?: string) {
    setOpen(true);
    setModeBoth('bot');
    if (url) {
      setCurrentUrl(url);
      setUrlInput(url);
      pushLog(`${t(language, 'logOpened')} ${hostnameOf(url)}`);
    } else {
      pushLog(t(language, 'logBrowserOpened'));
    }
  }

  function hostnameOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  // Execute a bot action. Read-only actions run at once in bot mode.
  // Tap/type go through the approval card first; sensitive fields
  // never reach the card — they hand over to the user instead.
  function requestAction(action: BrowserAction) {
    if (!open) return;
    if (modeRef.current !== 'bot') {
      pushLog(t(language, 'logBotPaused'));
      return;
    }
    if (action.kind === 'tap' || action.kind === 'type') {
      if (action.kind === 'type' && isSensitiveField(action.field)) {
        pushLog(t(language, 'logLoginField'));
        setModeBoth('user');
        return;
      }
      setPending(action);
      pendingRef.current = action;
      return;
    }
    executeReadOnly(action);
  }

  function executeReadOnly(action: BrowserAction) {
    if (action.kind === 'navigate') {
      setCurrentUrl(action.url);
      setUrlInput(action.url);
    } else if (action.kind === 'back') {
      if (canBack) webRef.current?.goBack();
    } else if (action.kind === 'forward') {
      if (canForward) webRef.current?.goForward();
    } else if (action.kind === 'reload') {
      webRef.current?.reload();
    } else if (action.kind === 'scroll') {
      const dy = action.direction === 'down' ? 600 : -600;
      webRef.current?.injectJavaScript(`window.scrollBy(0, ${dy}); true;`);
    }
    pushLog(describe(action));
  }

  function approvePending() {
    const action = pendingRef.current;
    setPending(null);
    pendingRef.current = null;
    if (!action) return;
    if (action.kind === 'tap') {
      const needle = jsString(action.text);
      // Best-effort click by visible text: buttons, links, and
      // role=button elements whose text contains the approved text.
      // Arbitrary sites vary, so a miss is reported, never faked.
      webRef.current?.injectJavaScript(`
        (function () {
          var needle = '${needle}'.toLowerCase();
          var els = Array.prototype.slice.call(document.querySelectorAll('button, a, [role="button"], input[type="submit"]'));
          var hit = els.find(function (el) { return (el.innerText || el.value || '').toLowerCase().indexOf(needle) !== -1; });
          if (hit) { hit.click(); window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bot-result', ok: true })); }
          else { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bot-result', ok: false })); }
          return true;
        })(); true;`);
      pushLog(`${t(language, 'logApproved')} ${describe(action)}`);
    } else if (action.kind === 'type') {
      const field = jsString(action.field);
      const value = jsString(action.value);
      webRef.current?.injectJavaScript(`
        (function () {
          var needle = '${field}'.toLowerCase();
          var els = Array.prototype.slice.call(document.querySelectorAll('input, textarea'));
          var hit = els.find(function (el) {
            var t = (el.type || '').toLowerCase();
            if (t === 'password' || t === 'hidden') return false;
            var hay = ((el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') + ' ' + (el.name || '') + ' ' + (el.id || '')).toLowerCase();
            return hay.indexOf(needle) !== -1;
          });
          if (!hit) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bot-result', ok: false })); return true; }
          // Second sensitive check (fix 2026-11-01): the model-supplied
          // field name is not the only signal — the matched DOM
          // element's OWN name/id/aria-label/placeholder/type are
          // tested against the sensitive pattern too, and any hit
          // refuses the match (a text-type OTP field the model calls
          // "code" must not slip through on the name alone).
          var sens = /pass|pwd|otp|pin|secret|credential/i;
          var attrs = ((hit.getAttribute('aria-label') || '') + ' ' + (hit.placeholder || '') + ' ' + (hit.name || '') + ' ' + (hit.id || '') + ' ' + (hit.type || '')).toLowerCase();
          if (sens.test(attrs)) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bot-result', ok: false })); return true; }
          var setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value') || Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
          if (setter && setter.set) setter.set.call(hit, '${value}'); else hit.value = '${value}';
          hit.dispatchEvent(new Event('input', { bubbles: true }));
          hit.dispatchEvent(new Event('change', { bubbles: true }));
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'bot-result', ok: true }));
          return true;
        })(); true;`);
      pushLog(`${t(language, 'logApproved')} ${describe(action)}`);
    }
  }

  function rejectPending() {
    setPending(null);
    pendingRef.current = null;
    pushLog(t(language, 'logRejected'));
  }

  useImperativeHandle(ref, () => ({ open: openPanel, requestAction }));

  if (!open) return null;

  return (
    <View style={[styles.panel, expanded && styles.panelExpanded]}>
      <View style={styles.topRow}>
        <Text style={styles.title} numberOfLines={1}>{t(language, 'browserWord')} · {botName}</Text>
        <Pressable accessibilityLabel="Close browser" onPress={() => { setOpen(false); setExpandedBoth(false); setPending(null); pendingRef.current = null; setModeBoth('bot'); }}>
          <Feather name="x" size={20} color={tokens.text} />
        </Pressable>
      </View>
      <View style={styles.urlRow}>
        <TextInput
          accessibilityLabel="Browser URL"
          value={urlInput}
          onChangeText={setUrlInput}
          placeholder="https://"
          placeholderTextColor={tokens.textMuted}
          style={styles.urlInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          accessibilityLabel="Go to URL"
          onPress={() => { const u = normalizeBrowserUrl(urlInput); if (u) { setCurrentUrl(u); pushLog(`${t(language, 'logOpened')} ${hostnameOf(u)}`); } }}
          style={styles.goButton}
        >
          <Text style={styles.goText}>{t(language, 'go')}</Text>
        </Pressable>
      </View>
      <View style={styles.controls}>
        <Pressable accessibilityLabel="Browser back" onPress={() => executeReadOnly({ kind: 'back' })} style={styles.ctrlButton}>
          <Feather name="chevron-left" size={20} color={tokens.text} />
        </Pressable>
        <Pressable accessibilityLabel="Browser forward" onPress={() => executeReadOnly({ kind: 'forward' })} style={styles.ctrlButton}>
          <Feather name="chevron-right" size={20} color={tokens.text} />
        </Pressable>
        <Pressable accessibilityLabel="Browser reload" onPress={() => executeReadOnly({ kind: 'reload' })} style={styles.ctrlButton}>
          <Feather name="refresh-cw" size={18} color={tokens.text} />
        </Pressable>
        <Text style={styles.modeText}>{mode === 'bot' ? t(language, 'botWorkingMode') : t(language, 'userControl')}</Text>
        {mode === 'bot' ? (
          <Pressable accessibilityLabel="Take Control" onPress={() => { setModeBoth('user'); pushLog(t(language, 'logTookControl')); }} style={styles.takeButton}>
            <Text style={styles.takeText}>{t(language, 'takeControl')}</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="Hand over to bot" onPress={() => { setModeBoth('bot'); pushLog(`${t(language, 'logHandedOver')} ${currentUrl ? hostnameOf(currentUrl) : t(language, 'logThisPage')}.`); }} style={styles.takeButton}>
            <Text style={styles.takeText}>{t(language, 'handOver')}</Text>
          </Pressable>
        )}
        <Pressable accessibilityLabel={expanded ? 'Shrink browser' : 'Expand browser'} onPress={() => setExpandedBoth(!expanded)} style={styles.ctrlButton}>
          <Feather name={expanded ? 'minimize-2' : 'maximize-2'} size={18} color={tokens.text} />
        </Pressable>
      </View>
      {pending ? (
        <View style={styles.approval}>
          <Text style={styles.approvalText}>{t(language, 'botWantsTo')} {describe(pending)}</Text>
          <Text style={styles.approvalSub}>{t(language, 'approveOnce')}</Text>
          <View style={styles.approvalRow}>
            <Button title={t(language, 'approve')} onPress={approvePending} />
            <Button title={t(language, 'reject')} variant="secondary" onPress={rejectPending} />
          </View>
        </View>
      ) : null}
      <View style={[styles.web, expanded && styles.webExpanded]}>
        {currentUrl ? (
          <WebView
            ref={webRef}
            source={{ uri: currentUrl }}
            originWhitelist={['https://*', 'http://*']}
            javaScriptCanOpenWindowsAutomatically={false}
            mediaPlaybackRequiresUserAction
            allowFileAccess={false}
            allowFileAccessFromFileURLs={false}
            allowUniversalAccessFromFileURLs={false}
            onShouldStartLoadWithRequest={(req) => /^https?:\/\//i.test(req.url)}
            onNavigationStateChange={(nav) => {
              setCurrentUrl(nav.url);
              setUrlInput(nav.url);
              setCanBack(nav.canGoBack);
              setCanForward(nav.canGoForward);
              // Login or check page: pause the bot, hand control to
              // the user. The bot never signs in or bypasses a check.
              if (modeRef.current === 'bot' && isLoginOrCaptchaPage(nav.url, nav.title)) {
                setModeBoth('user');
                pushLog(t(language, 'logLoginCheck'));
              }
            }}
            onMessage={(e) => {
              try {
                const data = JSON.parse(e.nativeEvent.data) as { type?: string; ok?: boolean };
                if (data.type === 'bot-result') pushLog(data.ok ? t(language, 'logDone') : t(language, 'logNotFound'));
              } catch { /* Non-JSON page messages are ignored. */ }
            }}
          />
        ) : (
          <Text style={styles.sub}>{t(language, 'enterUrl')}</Text>
        )}
      </View>
      <View style={styles.logBox}>
        <Text style={styles.logTitle}>{t(language, 'whatBotDid')}</Text>
        {log.slice(-3).map((line, i) => (
          <Text key={`${i}-${line}`} style={styles.logLine} numberOfLines={1}>{line}</Text>
        ))}
      </View>
    </View>
  );
});

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  approval: { backgroundColor: tokens.surfaceMuted, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, marginTop: 8, padding: 10 },
  approvalRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  approvalSub: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  approvalText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  controls: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8 },
  ctrlButton: { padding: 6 },
  goButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: 14, paddingVertical: 10 },
  goText: { color: tokens.onAccent, fontSize: tokens.font.md, fontWeight: '700' },
  logBox: { marginTop: 8 },
  logLine: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: 2 },
  logTitle: { color: tokens.text, fontSize: tokens.font.sm, fontWeight: '700' },
  modeText: { color: tokens.textMuted, flex: 1, fontSize: tokens.font.sm, textAlign: 'center' },
  panel: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.lg, borderWidth: 1, marginHorizontal: tokens.space.md, marginTop: 4, padding: 10 },
  panelExpanded: { flex: 1, marginHorizontal: 0, marginTop: 0, borderRadius: 0, borderWidth: 0 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, padding: 12 },
  takeButton: { backgroundColor: tokens.accent, borderRadius: tokens.radius.md, paddingHorizontal: 12, paddingVertical: 8 },
  takeText: { color: tokens.onAccent, fontSize: tokens.font.sm, fontWeight: '700' },
  title: { color: tokens.text, flex: 1, fontSize: tokens.font.md, fontWeight: '800' },
  topRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  urlInput: { backgroundColor: tokens.bg, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, flex: 1, fontSize: tokens.font.sm, paddingHorizontal: 10, paddingVertical: 8 },
  urlRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  web: { height: 280, marginTop: 8 },
  webExpanded: { flex: 1, height: undefined },
});

export default LiveBrowserPanel;
