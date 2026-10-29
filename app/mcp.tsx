import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteMcpServer, listBotMcpTools, listBots, listMcpServers, saveMcpServer, toggleBotMcpTool } from '../src/lib/db';
import { deleteMcpToken, getMcpToken, setMcpToken } from '../src/lib/connections';
import { listMcpTools, prepareMcpCall, requireHttpsUrl } from '../src/lib/mcp';
import { Bot, McpServer, McpTool, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

export default function McpScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [servers, setServers] = useState<McpServer[]>([]);
  const [enabledTools, setEnabledTools] = useState<{ serverId: string; toolName: string }[]>([]);
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>({});
  const [pendingCall, setPendingCall] = useState('');
  const [callResult, setCallResult] = useState('');
  const [msg, setMsg] = useState('');

  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpToken, setMcpTokenValue] = useState('');

  const refresh = useCallback(() => {
    listBots().then((b) => { setBots(b); if (!selectedBot && b[0]) setSelectedBot(b[0].id); }).catch(() => {});
    listMcpServers().then(setServers).catch(() => {});
    if (selectedBot) {
      listBotMcpTools(selectedBot).then(setEnabledTools).catch(() => {});
    }
  }, [selectedBot]);
  useFocusEffect(refresh);

  async function addMcpServer() {
    if (!mcpName.trim() || !mcpUrl.trim()) { Alert.alert('Check MCP server', 'MCP servers in Phase 1 are HTTP/SSE URLs only (no stdio on a phone).'); return; }
    try { requireHttpsUrl(mcpUrl.trim(), 'MCP server URL'); } catch (e) { Alert.alert('Check MCP server', e instanceof Error ? e.message : 'MCP server URL must be https://'); return; }
    const id = newId();
    await saveMcpServer({ id, name: mcpName.trim(), url: mcpUrl.trim(), createdAt: nowIso() });
    if (mcpToken.trim()) await setMcpToken(id, mcpToken);
    setMcpName(''); setMcpUrl(''); setMcpTokenValue('');
    setMsg('MCP server saved (HTTP/SSE only). List its tools, then enable specific tools for a bot.');
    refresh();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>MCP servers</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.sub}>HTTP/SSE only. Every tool call waits for your approval.</Text>
      <Text style={styles.bold}>Selected bot for enabling</Text>
      {bots.map((b) => (
        <Button key={b.id} title={b.name} variant={selectedBot === b.id ? 'primary' : 'secondary'} onPress={() => setSelectedBot(b.id)} />
      ))}
      {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}

      <Text style={[styles.title, { marginTop: 20 }]}>Add a server</Text>
      <Field label="Server name" onChangeText={setMcpName} value={mcpName} />
      <Field label="Server URL (https://…)" onChangeText={setMcpUrl} value={mcpUrl} />
      <Field label="Optional token (secure storage only)" secure onChangeText={setMcpTokenValue} value={mcpToken} />
      <Button title="Save MCP server" onPress={addMcpServer} />
      {servers.map((s) => (
        <Card key={s.id}>
          <Text style={styles.bold}>{s.name}</Text>
          <Text style={styles.sub}>{s.url}</Text>
          <Button title="List tools" variant="secondary" onPress={async () => { try { const tools = await listMcpTools(s.id, s.url); setToolsByServer({ ...toolsByServer, [s.id]: tools }); } catch (e) { setMsg(e instanceof Error ? e.message : 'Could not list tools.'); } }} />
          {(toolsByServer[s.id] ?? []).map((t) => {
            const enabled = enabledTools.some((x) => x.serverId === s.id && x.toolName === t.name);
            return (
              <View key={t.name} style={{ marginTop: 10 }}>
                <Text style={styles.bold}>{t.name}</Text>
                <Text style={styles.sub}>{t.description}</Text>
                <Button title={enabled ? 'Enabled for selected bot' : 'Enable for selected bot'} variant={enabled ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; await toggleBotMcpTool(selectedBot, s.id, t.name, !enabled); refresh(); }} />
                <View style={{ height: 8 }} />
                <Button title="Prepare a call (needs your approval)" variant="secondary" onPress={() => setPendingCall(JSON.stringify(prepareMcpCall(s.url, t.name, {}, s.id), null, 2))} />
              </View>
            );
          })}
          <View style={{ height: 8 }} />
          <Button title="Delete MCP server" variant="danger" onPress={async () => { await deleteMcpToken(s.id); await deleteMcpServer(s.id); refresh(); }} />
        </Card>
      ))}
      {pendingCall ? (
        <Card>
          <Text style={styles.bold}>Pending MCP call — NOT sent yet</Text>
          <Text style={styles.sub}>{pendingCall}</Text>
          <Button title="Approve & send this call" onPress={async () => { try { const call = JSON.parse(pendingCall) as any; requireHttpsUrl(String(call._serverUrl), 'MCP server URL'); const headers: Record<string, string> = { 'Content-Type': 'application/json' }; const token = call._serverId ? await getMcpToken(String(call._serverId)) : null; if (token) headers.Authorization = `Bearer ${token}`; const res = await fetch(call._serverUrl, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: call.jsonrpc, id: call.id, method: call.method, params: call.params }) }); setCallResult(await res.text()); } catch (e) { setCallResult(e instanceof Error ? e.message : 'Call failed.'); } setPendingCall(''); }} />
          <View style={{ height: 8 }} />
          <Button title="Cancel (do not send)" variant="secondary" onPress={() => setPendingCall('')} />
        </Card>
      ) : null}
      {callResult ? <Card><Text style={styles.bold}>MCP call result</Text><Text>{callResult.slice(0, 2000)}</Text></Card> : null}
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
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
