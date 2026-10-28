import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { saveMcpServer, savePlugin, saveSkill } from '../src/lib/db';
import { requireHttpsUrl } from '../src/lib/mcp';
import { GithubPreview, previewGithubRepo } from '../src/lib/github';
import { newId, nowIso } from '../src/lib/types';
import { tokens } from '../src/lib/tokens';

export default function GithubInstallScreen() {
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [ghUrl, setGhUrl] = useState('');
  const [ghHostedUrl, setGhHostedUrl] = useState('');
  const [preview, setPreview] = useState<GithubPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
    if (preview.detectedType !== 'mcp') setMsg(`Installed: ${preview.name} (${preview.detectedType}). No code was executed. Enable it for a Bot from the Skills, Plugins, or MCP page.`);
    setPreview(null); setGhUrl(''); setGhHostedUrl('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>Settings</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Install from GitHub</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body}>
      <Text style={styles.sub}>Paste any repo URL. Nothing installs or runs until you approve the preview below.</Text>
      {msg ? <Card><Text>{msg}</Text></Card> : null}
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
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { alignItems: 'center', flexDirection: 'row', gap: 2, paddingVertical: 6 },
  backText: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '600' },
  body: { flex: 1, padding: tokens.space.md },
  bold: { color: tokens.text, fontSize: tokens.font.md, fontWeight: '800', marginBottom: 4 },
  header: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: tokens.space.md, paddingVertical: 10 },
  headerTitle: { color: tokens.text, fontSize: tokens.font.lg, fontWeight: '800' },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
