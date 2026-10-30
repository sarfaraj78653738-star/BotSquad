import { getDb, getSetting, setSetting } from './db';
import { newId, nowIso } from './types';

// Projects and Artifacts — local only, SQLite, no sample data.
// Both lists start empty and only ever contain what the user creates
// (projects) or explicitly saves (artifacts). Nothing here is uploaded.

export type Project = { id: string; name: string; description: string; createdAt: string; updatedAt: string };
export type Artifact = { id: string; title: string; body: string; createdAt: string };

async function ensureTables() {
  const d = await getDb();
  await d.execAsync(`
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT NOT NULL);
  `);
}

export async function listProjects(): Promise<Project[]> {
  await ensureTables();
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM projects ORDER BY updated_at DESC');
  return (rows as any[]).map((r) => ({ id: r.id, name: r.name, description: r.description, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function createProject(name: string, description: string): Promise<Project> {
  await ensureTables();
  const d = await getDb();
  const now = nowIso();
  const p: Project = { id: newId(), name, description, createdAt: now, updatedAt: now };
  await d.runAsync('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?,?,?,?,?)', [p.id, p.name, p.description, p.createdAt, p.updatedAt]);
  return p;
}

export async function deleteProject(id: string): Promise<void> {
  await ensureTables();
  const d = await getDb();
  await d.runAsync('DELETE FROM projects WHERE id = ?', [id]);
}

// Project pin (user order 2026-10-30): pinned projects sort first on
// the Projects screen. Same settings-list pattern as pinned threads
// in db.ts — no schema change, so old installs just start unpinned.
export async function getPinnedProjects(): Promise<string[]> {
  try {
    const raw = await getSetting('pinned_projects');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export async function togglePinProject(id: string): Promise<boolean> {
  const pinned = await getPinnedProjects();
  const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
  await setSetting('pinned_projects', JSON.stringify(next));
  return next.includes(id);
}

export async function listArtifacts(): Promise<Artifact[]> {
  await ensureTables();
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM artifacts ORDER BY created_at DESC');
  return (rows as any[]).map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at }));
}

// Title = first line of the reply, body = the full reply text. Only
// ever called from an explicit "Save as artifact" tap on a message.
export async function saveArtifactFromReply(replyText: string): Promise<Artifact> {
  await ensureTables();
  const d = await getDb();
  const title = (replyText.split('\n').find((l) => l.trim()) ?? 'Artifact').trim().slice(0, 80) || 'Artifact';
  const a: Artifact = { id: newId(), title, body: replyText, createdAt: nowIso() };
  await d.runAsync('INSERT INTO artifacts (id, title, body, created_at) VALUES (?,?,?,?)', [a.id, a.title, a.body, a.createdAt]);
  return a;
}

export async function deleteArtifact(id: string): Promise<void> {
  await ensureTables();
  const d = await getDb();
  await d.runAsync('DELETE FROM artifacts WHERE id = ?', [id]);
}

// ---- Chat-to-project links (thread menu "Add to project") ----
// A project keeps a list of linked chats (Main, bot, or group
// threads). The link stores the chat's title at link time so the
// Projects screen can list it even if the thread is later renamed;
// opening a linked chat routes by kind + id.
export type ProjectChatLink = { projectId: string; kind: 'main' | 'bot' | 'group'; chatId: string; title: string; createdAt: string };

async function ensureLinkTable() {
  await ensureTables();
  const d = await getDb();
  await d.execAsync(`CREATE TABLE IF NOT EXISTS project_chats (project_id TEXT NOT NULL, kind TEXT NOT NULL, chat_id TEXT NOT NULL, title TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, kind, chat_id))`);
}

export async function linkChatToProject(projectId: string, kind: 'main' | 'bot' | 'group', chatId: string, title: string): Promise<void> {
  await ensureLinkTable();
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO project_chats (project_id, kind, chat_id, title, created_at) VALUES (?,?,?,?,?)', [projectId, kind, chatId, title, nowIso()]);
}

export async function listProjectChats(projectId: string): Promise<ProjectChatLink[]> {
  await ensureLinkTable();
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM project_chats WHERE project_id = ? ORDER BY created_at DESC', [projectId]);
  return (rows as any[]).map((r) => ({ projectId: r.project_id, kind: r.kind, chatId: r.chat_id, title: r.title, createdAt: r.created_at }));
}
