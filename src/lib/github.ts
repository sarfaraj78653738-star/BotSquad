// GitHub install — UNIVERSAL detector, preview first, install only on approval.
// Recognises, at minimum:
//  (a) Claude-style skills: SKILL.md (+ supporting .md files) -> Skill
//  (b) Plugin bundles: plugin.json / manifest with skills + actions -> Plugin (+ Skills)
//  (c) MCP servers: server.json, mcp.json, package.json with an MCP entry,
//      pyproject.toml for a Python MCP server -> MCP Connection, NOT phone code
//  (d) Prompt packs / instruction repos: .md prompt collections -> Skill
//
// UNIVERSAL RUN RULE (honest, shown in UI and code):
//  - Instruction repos (skills, prompts, configs) RUN on the phone in Phase 1:
//    they are text fed into a Bot's prompt, nothing more.
//  - Code MCP servers (Python/Node/TS servers needing stdio or a runtime) do
//    NOT run on the phone in Phase 1. The installer offers: (1) connect to a
//    hosted HTTP/SSE version if the user provides its URL, or (2) install as
//    "needs a host" with a clear reason. It never pretends to run, and never
//    executes repo code on the phone.

export type DetectedKind = 'skill' | 'plugin' | 'mcp' | 'prompt-pack' | 'unknown';
export type RunLocation = 'phone' | 'needs-host';

export interface GithubPreview {
  owner: string;
  repo: string;
  name: string;
  description: string;
  author: string;
  files: string[];
  detectedType: DetectedKind;
  runOnPhone: RunLocation;
  runReason: string;
  willInstall: string[];
  manifestText: string;
  skillText: string;
  readmeText: string;
  permissions: string;
  hasExecutableCode: boolean;
  executableFiles: string[];
}

const EXECUTABLE_EXTS = ['.js', '.ts', '.tsx', '.py', '.rb', '.go', '.rs', '.sh', '.bat', '.exe', '.dll', '.so', '.bin'];

const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export function parseGithubUrl(url: string): { owner: string; repo: string } {
  const m = url.trim().replace(/\/$/, '').match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  if (!m || !m[1] || !m[2]) throw new Error('Paste a GitHub repo URL like https://github.com/owner/repo');
  const owner = m[1];
  const repo = m[2].replace(/\.git$/i, '');
  // SECURITY FIX 2026-10-28: owner/repo used to be interpolated into
  // api.github.com / raw.githubusercontent.com URLs unvalidated, so a
  // crafted segment (.., ?, /, encoded separators) could reach a different
  // API path. Only real GitHub owner/repo names are accepted now, and both
  // segments are encoded at every use site.
  if (!GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repo)) {
    throw new Error('That GitHub URL has an invalid owner or repo name. Use a plain https://github.com/owner/repo link.');
  }
  return { owner, repo };
}

async function fetchText(url: string): Promise<string> {
  try {
    const res = await fetch(url, { headers: { Accept: 'application/vnd.github.raw, text/plain' } });
    if (!res.ok) return '';
    // SECURITY FIX 2026-10-28: cap fetched text so one huge SKILL.md /
    // README cannot blow up local storage or every future prompt.
    return (await res.text()).slice(0, 20000);
  } catch {
    return '';
  }
}

export async function previewGithubRepo(url: string): Promise<GithubPreview> {
  const { owner, repo } = parseGithubUrl(url);
  const encOwner = encodeURIComponent(owner);
  const encRepo = encodeURIComponent(repo);
  const metaRes = await fetch(`https://api.github.com/repos/${encOwner}/${encRepo}`);
  if (!metaRes.ok) throw new Error(`GitHub returned HTTP ${metaRes.status} for that repo. Check the URL — private repos are not supported in Phase 1.`);
  const meta: any = await metaRes.json();
  const treeRes = await fetch(`https://api.github.com/repos/${encOwner}/${encRepo}/git/trees/HEAD?recursive=1`);
  const tree: any = treeRes.ok ? await treeRes.json() : { tree: [] };
  const files: string[] = (tree.tree ?? []).map((t: any) => String(t.path)).slice(0, 300);
  const lowerFiles = files.map((f) => f.toLowerCase());
  const executableFiles = files.filter((f) => EXECUTABLE_EXTS.some((e) => f.toLowerCase().endsWith(e)));
  const raw = `https://raw.githubusercontent.com/${encOwner}/${encRepo}/HEAD`;
  const [pluginJson, serverJson, mcpJson, packageJson, pyproject, skillMd, readme] = await Promise.all([
    fetchText(`${raw}/plugin.json`),
    fetchText(`${raw}/server.json`),
    fetchText(`${raw}/mcp.json`),
    fetchText(`${raw}/package.json`),
    fetchText(`${raw}/pyproject.toml`),
    fetchText(`${raw}/SKILL.md`),
    fetchText(`${raw}/README.md`),
  ]);
  // Also look for a nested SKILL.md (Claude skills often live in skills/<name>/SKILL.md).
  let nestedSkill = '';
  const nestedSkillPath = files.find((f) => f.toLowerCase().endsWith('/skill.md'));
  if (!skillMd && nestedSkillPath) nestedSkill = await fetchText(`${raw}/${nestedSkillPath}`);
  const skillText = skillMd || nestedSkill;
  const manifestText = pluginJson || serverJson || mcpJson;

  let detectedType: DetectedKind = 'unknown';
  let permissions = '';
  try {
    const manifest = JSON.parse(manifestText || '{}') as any;
    permissions = [manifest.permissions, manifest.tools, manifest.actions].filter(Boolean).map((x: any) => (Array.isArray(x) ? x.join(', ') : String(x))).join('; ');
  } catch { /* not JSON — shown as text */ }

  const looksLikeMcp =
    !!serverJson || !!mcpJson ||
    /modelcontextprotocol|\"mcp\"/i.test(packageJson) ||
    /\[tool\.mcp\]|mcp\.server|fastmcp/i.test(pyproject) ||
    lowerFiles.some((f) => f.includes('mcp') && (f.endsWith('.json') || f.endsWith('.toml')));
  const looksLikePlugin = !!pluginJson;
  const looksLikeSkill = !!skillText;
  const mdFiles = files.filter((f) => f.toLowerCase().endsWith('.md'));

  if (looksLikePlugin) detectedType = 'plugin';
  else if (looksLikeMcp) detectedType = 'mcp';
  else if (looksLikeSkill) detectedType = 'skill';
  else if (mdFiles.length >= 2) detectedType = 'prompt-pack';

  const isCodeMcp = detectedType === 'mcp' && executableFiles.length > 0;
  const runOnPhone: RunLocation = isCodeMcp ? 'needs-host' : 'phone';
  const runReason = isCodeMcp
    ? 'This MCP server is code (Python/Node) that needs a runtime/stdio. It does NOT run on the phone in Phase 1. Connect a hosted HTTP/SSE URL below, or install it as "needs a host".'
    : detectedType === 'mcp'
      ? 'This MCP entry is a config/manifest. It can be used as an MCP connection over HTTP/SSE once you provide its server URL.'
      : 'Instruction text only — runs on the phone as Bot instructions. No code is executed.';
  const willInstall: string[] = [];
  if (detectedType === 'skill') willInstall.push('1 Skill (SKILL.md text, usable by Bots as instructions)');
  if (detectedType === 'prompt-pack') willInstall.push(`1 Skill (prompt collection: ${mdFiles.length} .md files, combined as instructions)`);
  if (detectedType === 'plugin') willInstall.push('1 Plugin record (manifest + skills/actions as definitions only, no code execution)');
  if (detectedType === 'mcp') willInstall.push(isCodeMcp ? '1 MCP Connection marked "needs a host" (or a live HTTP/SSE connection if you paste its hosted URL)' : '1 MCP Connection (HTTP/SSE, tools listed and enabled per Bot, every call approval-gated)');
  if (detectedType === 'unknown') willInstall.push('Nothing identifiable: README/manifest only, saved as a Plugin record for review — no code installed or run.');
  if (!permissions) permissions = 'No permissions declared in the manifest. The skill/instruction text itself is the only thing installed.';

  return {
    owner, repo,
    name: String(meta.name ?? repo),
    description: String(meta.description ?? ''),
    author: String(meta.owner?.login ?? owner),
    files, detectedType, runOnPhone, runReason, willInstall,
    manifestText, skillText, readmeText: readme,
    permissions,
    hasExecutableCode: executableFiles.length > 0,
    executableFiles: executableFiles.slice(0, 20),
  };
}
