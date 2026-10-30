import * as FileSystem from 'expo-file-system';
import { shareZipFile, zipFilesBase64 } from './chatExport';
import { getSetting, setSetting } from './db';

// The agent workspace: plain files on the phone, under the app's own
// documents directory. The agent reads, writes, and edits these files
// (writes/edits/deletes only after the user's approval in chat); the
// user browses them on the Workspace screen, previews .html pages
// there, and exports the whole workspace as a ZIP. Paths are confined
// to this directory: absolute paths and ".." are rejected, so a model
// can never wander outside the workspace. Files are text (code,
// pages, notes) — this is not a binary store.
export async function workspaceDir(): Promise<string> {
  const dir = `${FileSystem.documentDirectory ?? ''}workspace/`;
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export function safeWorkspacePath(path: string): string | null {
  const cleaned = path.trim().replace(/^\/+/, '');
  if (!cleaned || cleaned.includes('..') || cleaned.includes('\\')) return null;
  return cleaned;
}

export type WorkspaceFile = { path: string; size: number };

async function walk(dir: string, prefix: string, out: WorkspaceFile[]): Promise<void> {
  if (out.length >= 200) return;
  const names = await FileSystem.readDirectoryAsync(dir);
  for (const name of names) {
    if (out.length >= 200) return;
    const full = `${dir}${name}`;
    const info = await FileSystem.getInfoAsync(full);
    if (info.isDirectory) await walk(`${full}/`, `${prefix}${name}/`, out);
    else if (info.exists) out.push({ path: `${prefix}${name}`, size: info.size ?? 0 });
  }
}

export async function listWorkspaceFiles(): Promise<WorkspaceFile[]> {
  const dir = await workspaceDir();
  const out: WorkspaceFile[] = [];
  try { await walk(dir, '', out); } catch { /* empty workspace */ }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function readWorkspaceFile(path: string): Promise<string> {
  const dir = await workspaceDir();
  const text = await FileSystem.readAsStringAsync(`${dir}${path}`);
  return text.length > 50000 ? text.slice(0, 50000) + '\n…(truncated)' : text;
}

export async function writeWorkspaceFile(path: string, content: string): Promise<void> {
  const dir = await workspaceDir();
  const full = `${dir}${path}`;
  const slash = full.lastIndexOf('/');
  if (slash > dir.length) await FileSystem.makeDirectoryAsync(full.slice(0, slash), { intermediates: true });
  await FileSystem.writeAsStringAsync(full, content);
}

export async function deleteWorkspaceFile(path: string): Promise<void> {
  const dir = await workspaceDir();
  await FileSystem.deleteAsync(`${dir}${path}`, { idempotent: true });
}

// File pin (user order 2026-10-30): pinned files sort first on the
// Workspace screen, within their own tab and section. Same
// settings-list pattern as pinned threads — no schema change.
export async function getPinnedFiles(): Promise<string[]> {
  try {
    const raw = await getSetting('pinned_files');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export async function togglePinFile(path: string): Promise<boolean> {
  const pinned = await getPinnedFiles();
  const next = pinned.includes(path) ? pinned.filter((x) => x !== path) : [...pinned, path];
  await setSetting('pinned_files', JSON.stringify(next));
  return next.includes(path);
}

export async function workspaceFileUri(path: string): Promise<string> {
  const dir = await workspaceDir();
  return `${dir}${path}`;
}

export async function exportWorkspaceZip(): Promise<void> {
  const files = await listWorkspaceFiles();
  const contents: { name: string; text: string }[] = [];
  for (const f of files) {
    try { contents.push({ name: f.path, text: await readWorkspaceFile(f.path) }); } catch { /* skip unreadable files */ }
  }
  await shareZipFile('botsquad-workspace.zip', zipFilesBase64(contents.length ? contents : [{ name: 'README.txt', text: 'BotSquad workspace (empty).\n' }]));
}
