import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteConnection, listBotConnectionIds, listBots, listConnections, saveConnection, toggleBotConnection } from '../src/lib/db';
import { deleteConnectionToken, setConnectionToken } from '../src/lib/connections';
import { Bot, Connection, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

export default function ConnectScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [enabledConns, setEnabledConns] = useState<string[]>([]);
  const [msg, setMsg] = useState('');

  const [connName, setConnName] = useState('');
  const [connService, setConnService] = useState('');
  const [connToken, setConnToken] = useState('');

  const refresh = useCallback(() => {
    listBots().then((b) => { setBots(b); if (!selectedBot && b[0]) setSelectedBot(b[0].id); }).catch(() => {});
    listConnections().then(setConnections).catch(() => {});
    if (selectedBot) {
      listBotConnectionIds(selectedBot).then(setEnabledConns).catch(() => {});
    }
  }, [selectedBot]);
  useFocusEffect(refresh);

  async function addConnection() {
    if (!connName.trim() || !connService.trim()) { Alert.alert('Missing fields', 'Connection needs a name and a service.'); return; }
    const id = newId();
    await saveConnection({ id, name: connName.trim(), service: connService.trim(), scope: 'global', permissions: '', createdAt: nowIso() });
    if (connToken.trim()) await setConnectionToken(id, connToken);
    setConnName(''); setConnService(''); setConnToken('');
    setMsg('Connection saved. Its token is in secure storage only.');
    refresh();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Connections</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.bold}>Selected bot for enabling</Text>
      {bots.map((b) => (
        <Button key={b.id} title={b.name} variant={selectedBot === b.id ? 'primary' : 'secondary'} onPress={() => setSelectedBot(b.id)} />
      ))}
      {msg ? <Card><Text>{msg}</Text></Card> : null}

      <Text style={[styles.title, { marginTop: 20 }]}>Add a connection</Text>
      <Field label="Connection name" onChangeText={setConnName} value={connName} />
      <Field label="Service" onChangeText={setConnService} value={connService} />
      <Field label="API key / token (secure storage only)" secure onChangeText={setConnToken} value={connToken} />
      <Button title="Save connection" onPress={addConnection} />
      {connections.map((c) => (
        <Card key={c.id}>
          <Text style={styles.bold}>{c.name} — {c.service}</Text>
          <Button title={enabledConns.includes(c.id) ? 'Enabled for selected bot' : 'Enable for selected bot'} variant={enabledConns.includes(c.id) ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; const on = !enabledConns.includes(c.id); await toggleBotConnection(selectedBot, c.id, on); refresh(); }} />
          <View style={{ height: 8 }} />
          <Button title="Delete connection" variant="danger" onPress={async () => { await deleteConnectionToken(c.id); await deleteConnection(c.id); refresh(); }} />
        </Card>
      ))}
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
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
