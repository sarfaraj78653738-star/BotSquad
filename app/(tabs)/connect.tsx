import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Button, Card, Field } from '../../src/components/ui';
import { deleteConnection, deleteMcpServer, deleteSkill, listBotConnectionIds, listBotMcpTools, listBotSkillIds, listBots, listConnections, listMcpServers, listPlugins, listSkills, saveConnection, saveMcpServer, savePlugin, saveSkill, toggleBotConnection, toggleBotMcpTool, toggleBotSkill } from '../../src/lib/db';
import { deleteConnectionToken, deleteMcpToken, getMcpToken, setConnectionToken, setMcpToken } from '../../src/lib/connections';
import { listMcpTools, prepareMcpCall, requireHttpsUrl } from '../../src/lib/mcp';
import { GithubPreview, previewGithubRepo } from '../../src/lib/github';
import { Bot, Connection, McpServer, McpTool, Plugin, Skill, newId, nowIso } from '../../src/lib/types';
import { tokens } from '../../src/lib/tokens';

export default function ConnectScreen() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [selectedBot, setSelectedBot] = useState('');
  const [connections, setConnections] = useState<Connection[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [servers, setServers] = useState<McpServer[]>([]);
  const [enabledSkills, setEnabledSkills] = useState<string[]>([]);
  const [enabledConns, setEnabledConns] = useState<string[]>([]);
  const [enabledTools, setEnabledTools] = useState<{ serverId: string; toolName: string }[]>([]);
  const [toolsByServer, setToolsByServer] = useState<Record<string, McpTool[]>>({});
  const [pendingCall, setPendingCall] = useState('');
  const [callResult, setCallResult] = useState('');
  const [msg, setMsg] = useState('');

  const [connName, setConnName] = useState('');
  const [connService, setConnService] = useState('');
  const [connPerms, setConnPerms] = useState('');
  const [connToken, setConnToken] = useState('');
  const [skillName, setSkillName] = useState('');
  const [skillTemplate, setSkillTemplate] = useState('');
  const [mcpName, setMcpName] = useState('');
  const [mcpUrl, setMcpUrl] = useState('');
  const [mcpToken, setMcpTokenValue] = useState('');
  const [ghUrl, setGhUrl] = useState('');
  const [ghHostedUrl, setGhHostedUrl] = useState('');
  const [preview, setPreview] = useState<GithubPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const refresh = useCallback(() => {
    listBots().then((b) => { setBots(b); if (!selectedBot && b[0]) setSelectedBot(b[0].id); }).catch(() => {});
    listConnections().then(setConnections).catch(() => {});
    listSkills().then(setSkills).catch(() => {});
    listPlugins().then(setPlugins).catch(() => {});
    listMcpServers().then(setServers).catch(() => {});
    if (selectedBot) {
      listBotSkillIds(selectedBot).then(setEnabledSkills).catch(() => {});
      listBotConnectionIds(selectedBot).then(setEnabledConns).catch(() => {});
      listBotMcpTools(selectedBot).then(setEnabledTools).catch(() => {});
    }
  }, [selectedBot]);
  useFocusEffect(refresh);

  async function addConnection() {
    if (!connName.trim() || !connService.trim()) { Alert.alert('Missing fields', 'Connection needs a name and a service.'); return; }
    const id = newId();
    await saveConnection({ id, name: connName.trim(), service: connService.trim(), scope: 'global', permissions: connPerms, createdAt: nowIso() });
    if (connToken.trim()) await setConnectionToken(id, connToken);
    setConnName(''); setConnService(''); setConnPerms(''); setConnToken('');
    setMsg('Connection saved. Its token is in secure storage only. Enable it for a Bot below — it is not used until then.');
    refresh();
  }

  async function addSkill() {
    if (!skillName.trim() || !skillTemplate.trim()) { Alert.alert('Missing fields', 'A skill needs a name and instruction text.'); return; }
    await saveSkill({ id: newId(), botId: null, name: skillName.trim(), template: skillTemplate, source: 'local', repoUrl: null, permissions: '', createdAt: nowIso() });
    setSkillName(''); setSkillTemplate('');
    setMsg('Skill saved. Enable it for a Bot below.');
    refresh();
  }

  async function addMcpServer() {
    if (!mcpName.trim() || !mcpUrl.trim()) { Alert.alert('Check MCP server', 'MCP servers in Phase 1 are HTTP/SSE URLs only (no stdio on a phone).'); return; }
    try { requireHttpsUrl(mcpUrl.trim(), 'MCP server URL'); } catch (e) { Alert.alert('Check MCP server', e instanceof Error ? e.message : 'MCP server URL must be https://'); return; }
    const id = newId();
    await saveMcpServer({ id, name: mcpName.trim(), url: mcpUrl.trim(), createdAt: nowIso() });
    if (mcpToken.trim()) await setMcpToken(id, mcpToken);
    setMcpName(''); setMcpUrl(''); setMcpTokenValue('');
    setMsg('MCP server saved (HTTP/SSE only). List its tools, then enable specific tools for a Bot.');
    refresh();
  }

  async function doPreview() {
    setPreviewLoading(true); setPreview(null); setMsg('');
    try { setPreview(await previewGithubRepo(ghUrl)); } catch (e) { setMsg(e instanceof Error ? e.message : 'Preview failed.'); } finally { setPreviewLoading(false); }
  }

  async function installPreview() {
    if (!preview) return;
    const now = nowIso();
    if (preview.detectedType === 'skill' || preview.detectedType === 'prompt-pack') {
      await saveSkill({ id: newId(), botId: null, name: preview.name, template: preview.skillText || preview.readmeText, source: 'github', repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, permissions: preview.permissions, createdAt: now });
    } else if (preview.detectedType === 'plugin') {
      await savePlugin({ id: newId(), name: preview.name, description: preview.description, author: preview.author, repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, manifest: preview.manifestText, permissions: preview.permissions, hasExecutableCode: preview.hasExecutableCode, createdAt: now });
      if (preview.skillText) await saveSkill({ id: newId(), botId: null, name: `${preview.name} skill`, template: preview.skillText, source: 'github', repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, permissions: preview.permissions, createdAt: now });
    } else if (preview.detectedType === 'mcp') {
      if (ghHostedUrl.trim()) {
        try { requireHttpsUrl(ghHostedUrl.trim(), 'Hosted MCP URL'); } catch (e) { setMsg(e instanceof Error ? e.message : 'Hosted MCP URL must be https://'); return; }
      }
      if (ghHostedUrl.trim()) {
        const id = newId();
        await saveMcpServer({ id, name: preview.name, url: ghHostedUrl.trim(), createdAt: now });
        setMsg('Installed as a live MCP connection (hosted HTTP/SSE URL you provided). List its tools, then enable specific tools per Bot.');
      } else {
        await savePlugin({ id: newId(), name: preview.name, description: `${preview.description} — INSTALLED, NEEDS A HOST: code MCP server does not run on the phone in Phase 1.`, author: preview.author, repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, manifest: preview.manifestText, permissions: preview.permissions, hasExecutableCode: true, createdAt: now });
        setMsg('Installed as "needs a host". No code was run on the phone. Add its hosted HTTP/SSE URL later to use it.');
      }
    } else {
      await savePlugin({ id: newId(), name: preview.name, description: preview.description, author: preview.author, repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, manifest: preview.manifestText, permissions: preview.permissions, hasExecutableCode: preview.hasExecutableCode, createdAt: now });
    }
    if (preview.detectedType !== 'mcp') setMsg(`Installed: ${preview.name} (${preview.detectedType}). No code was executed. Enable it for a Bot below.`);
    setPreview(null); setGhUrl(''); setGhHostedUrl('');
    refresh();
  }

  return (
    <ScrollView style={styles.wrap}>
      <Text style={styles.title}>Connections, Skills & Plugins</Text>
      <Text style={styles.sub}>Nothing here is used until you enable it for a specific Bot. No connection, skill, or tool is auto-enabled.</Text>
      <Text style={styles.bold}>Selected bot for enabling</Text>
      {bots.map((b) => (
        <Button key={b.id} title={`${selectedBot === b.id ? '✓ ' : ''}${b.name}`} variant={selectedBot === b.id ? 'primary' : 'secondary'} onPress={() => setSelectedBot(b.id)} />
      ))}
      {msg ? <Card><Text>{msg}</Text></Card> : null}

      <Text style={[styles.title, { marginTop: 20 }]}>Add a connection</Text>
      <Field label="Connection name" onChangeText={setConnName} value={connName} />
      <Field label="Service (e.g. weather API, notes tool)" onChangeText={setConnService} value={connService} />
      <Field label="Visible permissions (what it may do)" multiline onChangeText={setConnPerms} value={connPerms} />
      <Field label="API key / token (secure storage only)" secure onChangeText={setConnToken} value={connToken} />
      <Button title="Save connection" onPress={addConnection} />
      {connections.map((c) => (
        <Card key={c.id}>
          <Text style={styles.bold}>{c.name} — {c.service}</Text>
          <Text style={styles.sub}>Permissions: {c.permissions || 'none declared'}</Text>
          <Button title={enabledConns.includes(c.id) ? 'Enabled for selected bot ✓' : 'Enable for selected bot'} variant={enabledConns.includes(c.id) ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; const on = !enabledConns.includes(c.id); await toggleBotConnection(selectedBot, c.id, on); refresh(); }} />
          <View style={{ height: 8 }} />
          <Button title="Delete connection" variant="danger" onPress={async () => { await deleteConnectionToken(c.id); await deleteConnection(c.id); refresh(); }} />
        </Card>
      ))}

      <Text style={[styles.title, { marginTop: 20 }]}>Skills (instruction templates, markdown)</Text>
      <Field label="Skill name" onChangeText={setSkillName} value={skillName} />
      <Field label="Skill instructions (markdown)" multiline onChangeText={setSkillTemplate} value={skillTemplate} />
      <Button title="Save skill" onPress={addSkill} />
      {skills.map((s) => (
        <Card key={s.id}>
          <Text style={styles.bold}>{s.name} ({s.source})</Text>
          <Text style={styles.sub} numberOfLines={3}>{s.template}</Text>
          {s.repoUrl ? <Text style={styles.sub}>{s.repoUrl}</Text> : null}
          <Button title={enabledSkills.includes(s.id) ? 'Enabled for selected bot ✓' : 'Enable for selected bot'} variant={enabledSkills.includes(s.id) ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; const on = !enabledSkills.includes(s.id); await toggleBotSkill(selectedBot, s.id, on); refresh(); }} />
          <View style={{ height: 8 }} />
          <Button title="Delete skill" variant="danger" onPress={async () => { await deleteSkill(s.id); refresh(); }} />
        </Card>
      ))}

      <Text style={[styles.title, { marginTop: 20 }]}>Plugins (definitions only, no code execution)</Text>
      {plugins.length === 0 && <Text style={styles.sub}>No plugins installed yet. Install one from GitHub below.</Text>}
      {plugins.map((p) => (
        <Card key={p.id}>
          <Text style={styles.bold}>{p.name}</Text>
          <Text style={styles.sub}>{p.description}</Text>
          <Text style={styles.sub}>Author: {p.author} · Permissions: {p.permissions}</Text>
          {p.hasExecutableCode ? <Text style={{ color: tokens.warning }}>Warning: this repo contains executable code. It was NOT executed — only its skill/instruction parts were installed.</Text> : null}
        </Card>
      ))}

      <Text style={[styles.title, { marginTop: 20 }]}>MCP servers (HTTP/SSE only)</Text>
      <Text style={styles.sub}>No stdio on a phone in Phase 1. Every tool call waits for your approval — see the pending call below before anything is sent.</Text>
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
                <Button title={enabled ? 'Enabled for selected bot ✓' : 'Enable for selected bot'} variant={enabled ? 'primary' : 'secondary'} onPress={async () => { if (!selectedBot) return; await toggleBotMcpTool(selectedBot, s.id, t.name, !enabled); refresh(); }} />
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

      <Text style={[styles.title, { marginTop: 20 }]}>Install from GitHub — universal</Text>
      <Text style={styles.sub}>Paste any repo URL. The app detects Claude skills, plugin bundles, MCP servers, and prompt packs. Nothing installs or runs until you approve the preview below.</Text>
      <Field label="GitHub repo URL" onChangeText={setGhUrl} placeholder="https://github.com/owner/repo" value={ghUrl} />
      <Button title={previewLoading ? 'Checking…' : 'Preview repo'} disabled={previewLoading} onPress={doPreview} />
      {preview && (
        <Card>
          <Text style={styles.bold}>{preview.name}</Text>
          <Text style={styles.sub}>{preview.description}</Text>
          <Text style={styles.sub}>Author: {preview.author}</Text>
          <Text style={styles.bold}>Detected type: {preview.detectedType}</Text>
          <Text style={styles.bold}>Runs on phone: {preview.runOnPhone === 'phone' ? 'YES — instructions only' : 'NO — needs a host'}</Text>
          <Text style={styles.sub}>{preview.runReason}</Text>
          <Text style={styles.bold}>Will install:</Text>
          {preview.willInstall.map((w, i) => <Text key={i} style={styles.sub}>• {w}</Text>)}
          <Text style={styles.sub}>Requested permissions/tools: {preview.permissions}</Text>
          {preview.skillText ? <><Text style={styles.bold}>Skill text — read this before approving (it will be fed to Bots as instructions):</Text><Text style={styles.sub}>{preview.skillText.slice(0, 8000)}{preview.skillText.length > 8000 ? '\n…(truncated for display; the full text is what installs)' : ''}</Text></> : null}
          {preview.manifestText ? <><Text style={styles.bold}>Manifest (truncated):</Text><Text style={styles.sub}>{preview.manifestText.slice(0, 4000)}</Text></> : null}
          {preview.hasExecutableCode ? <Text style={{ color: tokens.warning }}>Warning: this repo contains executable code ({preview.executableFiles.join(', ')}). It will NOT be executed in Phase 1 — only skill/instruction parts install.</Text> : null}
          {preview.detectedType === 'mcp' && preview.runOnPhone === 'needs-host' ? (
            <Field label="Hosted HTTP/SSE URL for this MCP server (optional — leave blank to install as needs-host)" onChangeText={setGhHostedUrl} value={ghHostedUrl} />
          ) : null}
          <Button title="Approve & install" onPress={installPreview} />
          <View style={{ height: 8 }} />
          <Button title="Cancel" variant="secondary" onPress={() => setPreview(null)} />
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bold: { fontWeight: '800', marginBottom: 4 },
  sub: { color: tokens.textMuted, marginBottom: tokens.space.sm },
  title: { fontSize: tokens.font.xl, fontWeight: '800', marginBottom: 8 },
  wrap: { backgroundColor: tokens.bg, flex: 1, padding: tokens.space.md },
});
