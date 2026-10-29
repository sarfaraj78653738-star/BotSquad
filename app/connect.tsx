import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { deleteConnection, listBotConnectionIds, listBots, listConnections, saveConnection, toggleBotConnection } from '../src/lib/db';
import { deleteConnectionToken, getConnectionToken, setConnectionToken } from '../src/lib/connections';
import { CONNECTION_CATALOG, CONNECTION_CATEGORIES, COMING_SOON_SERVICES, catalogFor, CatalogService } from '../src/lib/connectionCatalog';
import { verifyConnection } from '../src/lib/connectionVerify';
import { Bot, Connection, newId, nowIso } from '../src/lib/types';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

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
  const [language] = useLanguage();
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
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [connecting, setConnecting] = useState(false);
  const [addError, setAddError] = useState('');

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
    const initial: Record<string, string> = {};
    if (service) for (const f of service.fields) if (f.defaultValue) initial[f.key] = f.defaultValue;
    setFieldValues(initial);
    setAddError('');
    setView({ kind: 'add', service });
  }

  async function doConnect() {
    const name = addName.trim() || (view.kind === 'add' && view.service ? view.service.service : '');
    const service = view.kind === 'add' && view.service ? view.service.service : addService.trim();
    if (!name || !service) { Alert.alert(t(language, 'missingFields'), t(language, 'needNameService')); return; }
    const fields = view.kind === 'add' && view.service ? view.service.fields : [{ key: 'token', label: t(language, 'apiKeyTokenShort'), secure: true }];
    for (const f of fields) {
      if (!(fieldValues[f.key] ?? '').trim()) { setAddError(`${t(language, 'fillInLabel')} ${f.label}.`); return; }
    }
    // Catalog services are VERIFIED live before anything is saved: the
    // app calls the service's own API with these details, and only a
    // success builds the connection. Custom services cannot be
    // verified automatically, so they save directly.
    if (view.kind === 'add' && view.service) {
      setConnecting(true);
      setAddError('');
      const result = await verifyConnection(view.service, fieldValues, language);
      setConnecting(false);
      if (!result.ok) { setAddError(result.error ?? t(language, 'couldNotVerify')); return; }
      const id = newId();
      await saveConnection({ id, name, service, scope: 'global', permissions: '', createdAt: nowIso() });
      const toStore = fields.length === 1 ? fieldValues[fields[0].key].trim() : JSON.stringify(fieldValues);
      await setConnectionToken(id, toStore);
      setMsg(result.account ? `${name} ${t(language, 'connectedAs')} ${result.account}.` : `${name} ${t(language, 'connectedPlain')} ${t(language, 'verifiedWith')} ${service}.`);
      setView({ kind: 'list' });
      refresh();
      return;
    }
    const id = newId();
    await saveConnection({ id, name, service, scope: 'global', permissions: '', createdAt: nowIso() });
    if ((fieldValues.token ?? '').trim()) await setConnectionToken(id, fieldValues.token);
    setMsg(`${name} ${t(language, 'connectedSecure')}`);
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
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>{t(language, 'settings')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t(language, 'connections')}</Text>
        <View style={{ width: 84 }} />
      </View>
      <ScrollView style={styles.body}>
        {view.kind === 'list' && (
          <>
            <Text style={styles.sub}>{t(language, 'connectIntro')}</Text>
            <TextInput
              accessibilityLabel="Search connectors"
              onChangeText={setQuery}
              placeholder={t(language, 'searchConnectors')}
              placeholderTextColor={tokens.textMuted}
              style={styles.search}
              value={query}
            />
            {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
            <Text style={styles.sectionTitle}>{t(language, 'connectedSection')}</Text>
            <Card>
              <Pressable onPress={() => Alert.alert(t(language, 'browserWord'), t(language, 'browserAlertBody'))} style={styles.row}>
                <Feather name="globe" size={22} color={tokens.text} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{t(language, 'browserWord')}</Text>
                  <Text style={styles.rowSub}>{t(language, 'browserRowSub')}</Text>
                </View>
                <Feather name="chevron-right" size={20} color={tokens.textMuted} />
              </Pressable>
              {connected.map((c) => (
                <Pressable key={c.id} onPress={() => { void openDetail(c); }} style={[styles.row, styles.rowDivider]}>
                  <Feather name={iconFor(c.service)} size={22} color={tokens.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{c.name}</Text>
                    <Text style={styles.rowSub}>{c.service}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={tokens.textMuted} />
                </Pressable>
              ))}
            </Card>
            <Text style={styles.sectionTitle}>{t(language, 'availableSection')}</Text>
            {CONNECTION_CATEGORIES.map((cat) => {
              const items = available.filter((c) => c.category === cat);
              if (items.length === 0) return null;
              return (
                <View key={cat}>
                  <Text style={styles.categoryTitle}>{cat}</Text>
                  <Card>
                    {items.map((c, i) => (
                      <Pressable key={c.service} onPress={() => openAdd(c)} style={[styles.row, i > 0 && styles.rowDivider]}>
                        <Feather name={c.icon} size={22} color={tokens.text} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rowTitle}>{c.service}</Text>
                          <Text style={styles.rowSub} numberOfLines={2}>{c.blurb}</Text>
                        </View>
                        {connectedServices.has(c.service.toLowerCase()) && <Text style={styles.connectedTag}>{t(language, 'connectedTag')}</Text>}
                        <Text style={styles.connectText}>{t(language, 'connectBtn')}</Text>
                      </Pressable>
                    ))}
                  </Card>
                </View>
              );
            })}
            {matches('custom') && (
              <Card>
                <Pressable onPress={() => openAdd(null)} style={styles.row}>
                  <Feather name="plus" size={22} color={tokens.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{t(language, 'customService')}</Text>
                    <Text style={styles.rowSub} numberOfLines={2}>{t(language, 'customServiceSub')}</Text>
                  </View>
                  <Text style={styles.connectText}>{t(language, 'connectBtn')}</Text>
                </Pressable>
              </Card>
            )}
            {COMING_SOON_SERVICES.filter((c) => matches(c.service) || matches(c.blurb)).length > 0 && (
              <>
                <Text style={styles.sectionTitle}>{t(language, 'comingSoonSection')}</Text>
                <Card>
                  {COMING_SOON_SERVICES.filter((c) => matches(c.service) || matches(c.blurb)).map((c, i) => (
                    <Pressable key={c.service} onPress={() => Alert.alert(`${c.service} ${t(language, 'comingSoonSuffix')}`, `${c.service} ${t(language, 'comingSoonBody')}`)} style={[styles.row, i > 0 && styles.rowDivider]}>
                      <Feather name={c.icon} size={22} color={tokens.text} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{c.service}</Text>
                        <Text style={styles.rowSub} numberOfLines={2}>{c.blurb}</Text>
                      </View>
                      <Text style={styles.connectedTag}>{t(language, 'soonTag')}</Text>
                    </Pressable>
                  ))}
                </Card>
              </>
            )}
          </>
        )}

        {view.kind === 'add' && (
          <>
            <Pressable onPress={() => setView({ kind: 'list' })} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>{t(language, 'connections')}</Text>
            </Pressable>
            <Text style={styles.title}>{view.service ? `${t(language, 'connectVerb')} ${view.service.service}` : t(language, 'customService')}</Text>
            {view.service && <Text style={styles.sub}>{view.service.blurb}</Text>}
            {view.service && <Text style={styles.sub}>{t(language, 'neededLabel')} {view.service.keyHint}</Text>}
            <Field label={t(language, 'connectionName')} onChangeText={setAddName} value={addName} />
            {view.service === null && <Field label={t(language, 'serviceLabel')} onChangeText={setAddService} value={addService} />}
            {view.service
              ? view.service.fields.map((f) => (
                  <Field key={f.key} label={f.label} secure={f.secure} placeholder={f.placeholder} onChangeText={(t) => setFieldValues((v) => ({ ...v, [f.key]: t }))} value={fieldValues[f.key] ?? ''} />
                ))
              : <Field label={t(language, 'apiKeyToken')} secure onChangeText={(t) => setFieldValues((v) => ({ ...v, token: t }))} value={fieldValues.token ?? ''} />}
            {addError ? <Text style={styles.errorText}>{addError}</Text> : null}
            <Button title={connecting ? t(language, 'connecting') : view.service ? t(language, 'connectBtn') : t(language, 'saveConnectionBtn')} disabled={connecting} onPress={() => { void doConnect(); }} />
            {view.service && <Text style={styles.note}>{t(language, 'connectCheckA')} {view.service.service} {t(language, 'connectCheckB')}</Text>}
            <Text style={styles.note}>{t(language, 'detailsNote')}</Text>
          </>
        )}

        {view.kind === 'detail' && (
          <>
            <Pressable onPress={() => setView({ kind: 'list' })} style={styles.backRow}>
              <Feather name="chevron-left" size={22} color={tokens.text} />
              <Text style={styles.backText}>{t(language, 'connections')}</Text>
            </Pressable>
            <View style={styles.detailHead}>
              <Feather name={iconFor(view.conn.service)} size={28} color={tokens.text} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{view.conn.name}</Text>
                <Text style={styles.sub}>{view.conn.service}</Text>
              </View>
            </View>
            {catalogFor(view.conn.service) && <Text style={styles.sub}>{catalogFor(view.conn.service)!.blurb}</Text>}
            <Text style={styles.sub}>{detailHasKey ? t(language, 'keySaved') : t(language, 'noKeySaved')}</Text>
            {!detailHasKey && (
              <>
                <Field label={t(language, 'apiKeyToken')} secure onChangeText={setDetailToken} value={detailToken} />
                <Button title={t(language, 'saveKeyBtn')} onPress={async () => { if (!detailToken.trim()) return; await setConnectionToken(view.conn.id, detailToken); setDetailToken(''); setDetailHasKey(true); }} />
              </>
            )}
            <Text style={styles.sectionTitle}>{t(language, 'enabledFor')}</Text>
            {bots.length === 0 && <Text style={styles.sub}>{t(language, 'noBotsFirst')}</Text>}
            {bots.map((b) => {
              const on = detailEnabledBots.includes(b.id);
              return (
                <Card key={b.id}>
                  <Text style={styles.rowTitle}>{b.name}</Text>
                  <View style={{ height: 8 }} />
                  <Button title={on ? t(language, 'enabledBtn') : t(language, 'enableBtn')} variant={on ? 'primary' : 'secondary'} onPress={async () => { await toggleBotConnection(b.id, view.conn.id, !on); setDetailEnabledBots(on ? detailEnabledBots.filter((x) => x !== b.id) : [...detailEnabledBots, b.id]); }} />
                </Card>
              );
            })}
            <View style={{ height: 12 }} />
            <Button title={t(language, 'deleteConnectionBtn')} variant="danger" onPress={() => Alert.alert(t(language, 'deleteConnectionTitle'), `${view.conn.name} ${t(language, 'deleteConnectionBody')}`, [
              { text: t(language, 'cancel'), style: 'cancel' },
              { text: t(language, 'delete'), style: 'destructive', onPress: async () => { await deleteConnectionToken(view.conn.id); await deleteConnection(view.conn.id); setView({ kind: 'list' }); refresh(); } },
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
  categoryTitle: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 8, marginTop: 12 },
  connectText: { color: tokens.accent, fontSize: tokens.font.md, fontWeight: '800' },
  connectedTag: { color: tokens.textMuted, fontSize: tokens.font.sm, fontWeight: '700', marginRight: 8 },
  detailHead: { alignItems: 'center', flexDirection: 'row', gap: 12, marginVertical: 8 },
  errorText: { color: tokens.danger, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
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
