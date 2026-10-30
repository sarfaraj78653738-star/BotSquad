import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Button, Card, Field } from '../src/components/ui';
import { saveMcpServer, savePlugin, saveSkill } from '../src/lib/db';
import { requireHttpsUrl } from '../src/lib/mcp';
import { GithubPreview, previewGithubRepo } from '../src/lib/github';
import { newId, nowIso } from '../src/lib/types';
import { useLanguage, useTokens } from '../src/lib/tokens';
import { t } from '../src/lib/i18n';

export default function GithubInstallScreen() {
  const tokens = useTokens();
  const [language] = useLanguage();
  const styles = getStyles(tokens);
  const router = useRouter();
  const [msg, setMsg] = useState('');
  const [ghUrl, setGhUrl] = useState('');
  const [ghHostedUrl, setGhHostedUrl] = useState('');
  const [preview, setPreview] = useState<GithubPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function doPreview() {
    setPreviewLoading(true); setPreview(null); setMsg('');
    try { setPreview(await previewGithubRepo(ghUrl)); } catch (e) { setMsg(e instanceof Error ? e.message : t(language, 'previewFailed')); } finally { setPreviewLoading(false); }
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
        try { requireHttpsUrl(ghHostedUrl.trim(), 'Hosted MCP URL'); } catch (e) { setMsg(e instanceof Error ? e.message : t(language, 'hostedMustHttps')); return; }
      }
      if (ghHostedUrl.trim()) {
        const id = newId();
        await saveMcpServer({ id, name: preview.name, url: ghHostedUrl.trim(), createdAt: now });
        setMsg(t(language, 'installedMcp'));
      } else {
        await savePlugin({ id: newId(), name: preview.name, description: `${preview.description} — INSTALLED, NEEDS A HOST: code MCP server does not run on the phone in Phase 1.`, author: preview.author, repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, manifest: preview.manifestText, permissions: preview.permissions, hasExecutableCode: true, createdAt: now });
        setMsg(t(language, 'installedNeedsHost'));
      }
    } else {
      await savePlugin({ id: newId(), name: preview.name, description: preview.description, author: preview.author, repoUrl: `https://github.com/${preview.owner}/${preview.repo}`, manifest: preview.manifestText, permissions: preview.permissions, hasExecutableCode: preview.hasExecutableCode, createdAt: now });
    }
    if (preview.detectedType !== 'mcp') setMsg(`${t(language, 'installedAs')} ${preview.name}. ${t(language, 'enableItIn')} ${preview.detectedType === 'plugin' ? t(language, 'plugins') : t(language, 'skills')}.`);
    setPreview(null); setGhUrl(''); setGhHostedUrl('');
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Pressable accessibilityLabel="Back to Settings" onPress={() => router.canGoBack() ? router.back() : router.replace('/settings')} style={styles.backRow}>
          <Feather name="chevron-left" size={22} color={tokens.text} />
          <Text style={styles.backText}>{t(language, 'settings')}</Text>
        </Pressable>
        <Text style={styles.headerTitle}>{t(language, 'githubInstall')}</Text>
        <View style={{ width: 84 }} />
      </View>
    <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 40 }}>
      <Text style={styles.sub}>{t(language, 'ghIntro')}</Text>
      {msg ? <Card><Text style={styles.msgText}>{msg}</Text></Card> : null}
      <Field label={t(language, 'ghUrlLabel')} onChangeText={setGhUrl} placeholder="https://github.com/owner/repo" value={ghUrl} />
      <Button title={previewLoading ? t(language, 'checking') : t(language, 'previewRepo')} disabled={previewLoading} onPress={doPreview} />
      {preview && (
        <Card>
          <Text style={styles.bold}>{preview.name}</Text>
          <Text style={styles.sub}>{preview.description}</Text>
          <Text style={styles.sub}>{t(language, 'authorLabel')} {preview.author}</Text>
          <Text style={styles.bold}>{t(language, 'detectedType')} {preview.detectedType}</Text>
          <Text style={styles.bold}>{t(language, 'runsOnPhone')} {preview.runOnPhone === 'phone' ? t(language, 'runsYes') : t(language, 'runsNo')}</Text>
          <Text style={styles.sub}>{preview.runReason}</Text>
          <Text style={styles.bold}>{t(language, 'willInstall')}</Text>
          {preview.willInstall.map((w, i) => <Text key={i} style={styles.sub}>• {w}</Text>)}
          <Text style={styles.sub}>{t(language, 'requestedPerms')} {preview.permissions}</Text>
          {preview.skillText ? <><Text style={styles.bold}>{t(language, 'skillTextTitle')}</Text><Text style={styles.sub}>{preview.skillText.slice(0, 8000)}{preview.skillText.length > 8000 ? `\n${t(language, 'truncatedNote')}` : ''}</Text></> : null}
          {preview.manifestText ? <><Text style={styles.bold}>{t(language, 'manifestTitle')}</Text><Text style={styles.sub}>{preview.manifestText.slice(0, 4000)}</Text></> : null}
          {preview.hasExecutableCode ? <Text style={{ color: tokens.warning }}>{t(language, 'execWarningGhA')} ({preview.executableFiles.join(', ')}). {t(language, 'execWarningGhB')}</Text> : null}
          {preview.detectedType === 'mcp' && preview.runOnPhone === 'needs-host' ? (
            <Field label={t(language, 'hostedUrlLabel')} onChangeText={setGhHostedUrl} value={ghHostedUrl} />
          ) : null}
          <Button title={t(language, 'approveInstall')} onPress={installPreview} />
          <View style={{ height: 8 }} />
          <Button title={t(language, 'cancel')} variant="secondary" onPress={() => setPreview(null)} />
        </Card>
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
  msgText: { color: tokens.text, fontSize: tokens.font.md },
  sub: { color: tokens.textMuted, fontSize: tokens.font.md, marginBottom: tokens.space.sm },
  wrap: { backgroundColor: tokens.bg, flex: 1 },
});
