import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteConnection, listBotConnectionIds, listBots, listConnections, saveConnection, toggleBotConnection } from '../src/lib/db';
import { deleteConnectionToken, getConnectionToken, setConnectionToken } from '../src/lib/connections';
import { CONNECTION_CATALOG, catalogFor, CatalogService } from '../src/lib/connectionCatalog';
import { Bot, Connection, newId, nowIso } from '../src/lib/types';
import { useTokens } from '../src/lib/tokens';

// Connections, rebuilt (user order 2026-10-29): the old screen was a
// blank name/service/key form with a "selected bot" picker on top —
// nobody could tell what a connection was for. Now it reads like a
// connector list: a search box, a Connected section, and an Available
// section of real services with a Connect button each. Tapping a
// connected service opens its detail: what it is, whether its key is
// saved, which bots it is enabled for, and Delete. Keys still live
// only in SecureStore, and deleting a connection still revokes its
// key. Only token-based services are offered: login-based services
// (Gmail, Instagram, and the like) need OAuth, which this phone-local
// app has no server for, so they are named in a note, not faked as
// key fields.
type ConnectView =
  | { kind: 'list' }
  | { kind: 'detail'; conn: Connection }
  | { kind: 'add'; service: CatalogService | null };

export default function ConnectScreen() {
  const tokens = useTokens();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [bots, setBots] = useState<Bot[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [query, setQuery] = useState('');
  const [view, setView] = useState<ConnectView>({ kind: 'list' });
  const [msg, setMsg] = useState('');

  // Add form
  const [addName, setAddName] = useState('');
  const [addService, setAddService] = useState('');
  const [addToken, setAddToken] = useState('');

  // Detail state
  const [detailHasKey, setDetailHasKey] = useState(false);
  const [detailEnabledBots, setDetailEnabledBots] = useState<string[]>([]);
  const [detailToken, setDetailToken] = useState('');

  const refresh = useCallback(() => {
    listBots().then(setBots).catch(() => {});
    listConnections().then(setConnections).catch(() => {});
  }, []);
  useFocusEffect(refresh);

  async function openDetail(conn: Connection) {
    setView({ kind: 'detail', conn });
    setDetailToken('');
    try { setDetailHasKey((await getConnectionToken(conn.id)) !== null); } catch { setDetailHasKey(false); }
    const enabled: string[] = [];
    for (const b of bots) {
      try { if ((await listBotConnectionIds(b.id)).includes(conn.id)) enabled.push(b.id); } catch { /* ignore */ }
    }
    setDetailEnabledBots(enabled);
  }

  function openAdd(service: CatalogService | null) {
    setAddName(service ? service.service : '');
    setAddService(service ? service.service : '');
    setAddToken('');
    setView({ kind: 'add', service });
  }

  async function saveAdd() {
    const name = addName.trim();
    const service = addService.trim();
    if (!name || !service) { Alert.alert('Missing fields', 'A connection needs a name and a service.'); return; }
    const id = newId();
    await saveConnection({ id, name, service, scope: 'global', permissions: '', createdAt: nowIso() });
    if (addToken.trim()) await setConnectionToken(id, addToken);
    setMsg(`${name} connected. Its key stays in this phone's secure storage only.`);
    setView({ kind: 'list' });
    refresh();
  }

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);
  const connected = connections.filter((c) => matches(c.name) || matches(c.service));
  const available = CONNECTION_CATALOG.filter((c) => matches(c.service) || matches(c.blurb));
  const connectedServices = new Set(connections.map((c) => c.service.toLowerCase()));

  function iconFor(service: string): React.ComponentProps<typeof Feather>['name'] {
    return catalogFor(service)?.icon ?? 'link';
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
        {view.kind === 'list' && (
          <>
            <Text style={styles.sub}>A connection lets a bot use a service. The key is stored only on this phone, never sent anywhere except to that service when the bot uses it.</Text>
            <TextInput
              accessibilityLabel="Search connectors"
              onChangeText={setQuery}
              placeholder="Search connectors"
              placeholderTextColor={tokens.textMuted}
              style={styles.search}
              value={query}
            />
            {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
            {connected.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>Connected</Text>
                <Card>
                  {connected.map((c, i) => (
                    <Pressable key={c.id} onPress={() => { void openDetail(c); }} style={[styles.row, i > 0 && styles.rowDivider]}>
                      <Feather name={iconFor(c.service)} size={22} color={tokens.text} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{c.name}</Text>
                        <Text style={styles.rowSub}>{c.service}</Text>
                      </View>
                      <Feather name="chevron-right" size={20} color={tokens.textMuted} />
                    </Pressable>
                  ))}
                </Card>
              </>
            )}
            <Text style={styles.sectionTitle}>Available</Text>
            <Card>
              {available.map((c, i) => (
                <Pressable key={c.service} onPress={() => openAdd(c)} style={[styles.row, i > 0 && styles.rowDivider]}>
                  <Feather name={c.icon} size={22} color={tokens.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.service}</Text>
                    <Text style={styles.rowSub} numberOfLines={2}>{c.blurb}</Text>
                  </View>
                  {connectedServices.has(c.service.toLowerCase()) && <Text style={styles.connectedTag}>Connected</Text>}
                  <Text style={styles.connectText}>Connect</Text>
                </Pressable>
              ))}
              {matches('custom') && (
                <Pressable onPress={() => openAdd(null)} style={[styles.row, available.length > 0 && styles.rowDivider]}>
                  <Feather name="plus" size={22} color={tokens.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Custom service</Text>
                    <Text style={styles.rowSub} numberOfLines={2}>Any other service that works with an API key.</Text>
                  </View>
                  <Text style={styles.connectText}>Connect</Text>
                </Pressable>
              )}
            </Card>
            <Text style={styles.note}>Gmail, Instagram, and similar login-based services are not listed here: they need a login (OAuth), which this phone-local app cannot do yet. Only services that work with an API key are offered.</Text>
          </>
        )}

        {view.kind === 'add' && (
          <>
            <Pressable onPress={() => setView({ kind: 'list' })} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>Connections</Text>
            </Pressable>
            <Text style={styles.title}>{view.service ? `Connect ${view.service.service}` : 'Custom service'}</Text>
            {view.service && <Text style={styles.sub}>{view.service.blurb}</Text>}
            {view.service && <Text style={styles.sub}>Key needed: {view.service.keyHint}</Text>}
            <Field label="Connection name" onChangeText={setAddName} value={addName} />
            {view.service === null && <Field label="Service" onChangeText={setAddService} value={addService} />}
            <Field label="API key / token (secure storage only)" secure onChangeText={setAddToken} value={addToken} />
            <Button title="Save connection" onPress={() => { void saveAdd(); }} />
            <Text style={styles.note}>The key stays in this phone's secure storage. It is never shown again after saving.</Text>
          </>
        )}

        {view.kind === 'detail' && (
          <>
            <Pressable onPress={() => setView({ kind: 'list' })} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>Connections</Text>
            </Pressable>
            <View style={styles.detailHead}>
              <Feather name={iconFor(view.conn.service)} size={28} color={tokens.text} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{view.conn.name}</Text>
                <Text style={styles.sub}>{view.conn.service}</Text>
              </View>
            </View>
            {catalogFor(view.conn.service) && <Text style={styles.sub}>{catalogFor(view.conn.service)!.blurb}</Text>}
            <Text style={styles.sub}>{detailHasKey ? 'Key saved in this phone\'s secure storage.' : 'No key saved for this connection yet.'}</Text>
            {!detailHasKey && (
              <>
                <Field label="API key / token (secure storage only)" secure onChangeText={setDetailToken} value={detailToken} />
                <Button title="Save key" onPress={async () => { if (!detailToken.trim()) return; await setConnectionToken(view.conn.id, detailToken); setDetailToken(''); setDetailHasKey(true); }} />
              </>
            )}
            <Text style={styles.sectionTitle}>Enabled for</Text>
            {bots.length === 0 && <Text style={styles.sub}>No bots yet. Create a bot first, then enable this connection for it here.</Text>}
            {bots.map((b) => {
              const on = detailEnabledBots.includes(b.id);
              return (
                <Card key={b.id}>
                  <Text style={styles.rowTitle}>{b.name}</Text>
                  <View style={{ height: 8 }} />
                  <Button title={on ? 'Enabled' : 'Enable'} variant={on ? 'primary' : 'secondary'} onPress={async () => { await toggleBotConnection(b.id, view.conn.id, !on); setDetailEnabledBots(on ? detailEnabledBots.filter((x) => x !== b.id) : [...detailEnabledBots, b.id]); }} />
                </Card>
              );
            })}
            <View style={{ height: 12 }} />
            <Button title="Delete connection" variant="danger" onPress={() => Alert.alert('Delete this connection?', `${view.conn.name} will be removed, its key revoked, and it will be disabled for all bots.`, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => { await deleteConnectionToken(view.conn.id); await deleteConnection(view.conn.id); setView({ kind: 'list' }); refresh(); } },
            ])} />
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
  connectText: { color: tokens.accent, fontSize: tokens.font.md, fontWeight: '800' },
  connectedTag: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700', marginRight: 8 },
  detailHead: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 8 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  note: { color: tokens.textMuted, fontSize: tokens.font.sm, marginTop: tokens.space.md },
  row: { alignItems: 'center', flexDirection: 'row', gap: 12, paddingVertical: 10 },
  rowDivider: { borderColor: tokens.border, borderTopWidth: 1 },
  rowSub: { color: tokens.textMuted, fontSize: tokens.font.sm },
  rowTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '700' },
  search: { backgroundColor: tokens.surface, borderColor: tokens.border, borderRadius: tokens.radius.md, borderWidth: 1, color: tokens.text, fontSize: tokens.font.md, marginBottom: tokens.space.md, paddingHorizontal: 12, paddingVertical: 10 },
  sectionTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 8, marginTop: 16 },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  title: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800', marginBottom: 4 },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
