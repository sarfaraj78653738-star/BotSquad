import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteMcpServer, listMcpServers, saveMcpServer } from '../src/lib/db';
import { deleteMcpToken, getMcpToken, setMcpToken } from '../src/lib/connections';
import { listMcpTools, prepareMcpCall, requireHttpsUrl } from '../src/lib/mcp';
import { McpServer, McpTool, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

// MCP servers, skill-style (user order 2026-10-29): this screen is
// ONLY the saved-servers library. No "selected bot" picker, no
// per-bot enabling — an added server is automatically available to
// every chat. To use one, the user calls it out at the start of a
// chat message ("/server-name ..." or "Server Name, ...") and that
// turn's prompt carries the server's tools; in Main Chat the agent
// loop can then run one with mcp_call (approval-gated). Old
// bot_mcp_tools rows are unused (table kept, harmless).
export default function McpScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [detail, setDetail] = useState<McpServer | null>(null);
  const [tools, setTools] = useState<McpTool[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [pendingCall, setPendingCall] = useState('');
  const [callResult, setCallResult] = useState('');
  const [msg, setMsg] = useState('');

  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpToken, setMcpTokenValue] = useState('');

  const refresh = useCallback(() => {
    listMcpServers().then(setServers).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  async function openDetail(s: McpServer) {
    setDetail(s);
    setTools([]);
    setPendingCall('');
    setCallResult('');
    setHasToken((await getMcpToken(s.id)) !== null);
  }

  async function addMcpServer() {
    if (!mcpName.trim() || !mcpUrl.trim()) { Alert.alert('Check MCP server', 'A server needs a name and an https:// URL.'); return; }
    try { requireHttpsUrl(mcpUrl.trim(), 'MCP server URL'); } catch (e) { Alert.alert('Check MCP server', e instanceof Error ? e.message : 'MCP server URL must be https://'); return; }
    const id = newId();
    await saveMcpServer({ id, name: mcpName.trim(), url: mcpUrl.trim(), createdAt: nowIso() });
    if (mcpToken.trim()) await setMcpToken(id, mcpToken);
    setMcpName(''); setMcpUrl(''); setMcpTokenValue('');
    setMsg(`${mcpName.trim()} saved. Call it out in any chat with /${mcpName.trim().toLowerCase().replace(/[\s\-_]+/g, '')}.`);
    refresh();
  }

  async function deleteServer(s: McpServer) {
    Alert.alert('Delete MCP server?', `${s.name} will be removed.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => { await deleteMcpToken(s.id); await deleteMcpServer(s.id); setDetail(null); refresh(); },
      },
    ]);
  }

  async function sendPendingCall() {
    try {
      const call = JSON.parse(pendingCall) as any;
      requireHttpsUrl(String(call._serverUrl), 'MCP server URL');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const token = call._serverId ? await getMcpToken(String(call._serverId)) : null;
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(call._serverUrl, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: call.jsonrpc, id: call.id, method: call.method, params: call.params }) });
      setCallResult(await res.text());
    } catch (e) {
      setCallResult(e instanceof Error ? e.message : 'Call failed.');
    }
    setPendingCall('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {detail ? (
          <Pressable accessibilityLabel="Back to MCP servers" onPress={() => setDetail(null)} style={styles.backRow}>
            <Feather name="chevron-left" size={22} color={tokens.text} />
            <Text style={styles.backText}>MCP servers</Text>
          </Pressable>
        ) : (
          <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
            <Feather name="chevron-left" size={22} color={tokens.text} />
            <Text style={styles.backText}>Settings</Text>
          </Pressable>
        )}
        <Text style={styles.headerTitle}>{detail ? detail.name : 'MCP servers'}</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        {detail ? (
          <>
            <Text style={styles.sub}>{detail.url}</Text>
            <Text style={styles.sub}>Token: {hasToken ? 'saved in secure storage, never shown here.' : 'none saved.'}</Text>
            <Button title="List tools" variant="secondary" onPress={async () => { try { setTools(await listMcpTools(detail.id, detail.url)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not list tools.'); } }} />
            {tools.map((t) => (
              <View key={t.name} style={{ marginTop: 12 }}>
                <Text style={styles.bold}>{t.name}</Text>
                <Text style={styles.sub}>{t.description}</Text>
                <Button title="Prepare a call (needs your approval)" variant="secondary" onPress={() => setPendingCall(JSON.stringify(prepareMcpCall(detail.url, t.name, {}, detail.id), null, 2))} />
              </View>
            ))}
            {pendingCall ? (
              <Card>
                <Text style={styles.bold}>Pending MCP call — NOT sent yet</Text>
                <Text style={styles.sub}>{pendingCall}</Text>
                <Button title="Approve & send this call" onPress={() => { void sendPendingCall(); }} />
                <View style={{ height: 8 }} />
                <Button title="Cancel (do not send)" variant="secondary" onPress={() => setPendingCall('')} />
              </Card>
            ) : null}
            {callResult ? <Card><Text style={styles.bold}>MCP call result</Text><Text>{callResult.slice(0, 2000)}</Text></Card> : null}
            {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
            <View style={{ height: 12 }} />
            <Button title="Delete MCP server" variant="danger" onPress={() => { void deleteServer(detail); }} />
          </>
        ) : (
          <>
            <Text style={styles.title}>Add a server</Text>
            <Field label="Server name" onChangeText={setMcpName} value={mcpName} />
            <Field label="Server URL (https://…)" onChangeText={setMcpUrl} value={mcpUrl} />
            <Field label="Optional token (secure storage only)" secure onChangeText={setMcpTokenValue} value={mcpToken} />
            <Button title="Save MCP server" onPress={addMcpServer} />
            {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
            <Text style={styles.hint}>To use a server in chat, start your message with /server-name.</Text>
            {servers.map((s) => (
              <Pressable key={s.id} onPress={() => { void openDetail(s); }}>
                <Card>
                  <Text style={styles.bold}>{s.name}</Text>
                  <Text style={styles.sub} numberOfLines={2}>{s.url}</Text>
                </Card>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (tokens: ReturnType<typeof useTokens>) => StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  hint: { color: tokens.textMuted, fontSize: tokens.font.md, marginVertical: tokens.space.md },
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
