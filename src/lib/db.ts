import * as SQLite from 'expo-sqlite';
import { Bot, Chat, Connection, GroupMessage, GroupThread, McpServer, MemoryNote, Message, Plugin, Routine, Skill, newId, nowIso } from './types';

let db: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (db) return db;
  db = await SQLite.openDatabaseAsync('botsquad.db');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS bots (id TEXT PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, avatar_color TEXT NOT NULL, avatar_icon TEXT NOT NULL, task TEXT NOT NULL DEFAULT '', personality TEXT NOT NULL DEFAULT '', instructions TEXT NOT NULL DEFAULT '', boundaries TEXT NOT NULL DEFAULT '', provider TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT, is_pinned INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, title TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, chat_id TEXT NOT NULL REFERENCES chats(id) ON DELETE CASCADE, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, role TEXT NOT NULL, text TEXT NOT NULL, approval_state TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS skills (id TEXT PRIMARY KEY, bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL, name TEXT NOT NULL, template TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS routines (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, skill_id TEXT REFERENCES skills(id) ON DELETE SET NULL, name TEXT NOT NULL, schedule TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', last_run_at TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_memory (id TEXT PRIMARY KEY, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, note TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'user_correction', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, name TEXT NOT NULL, service TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'global', permissions TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS mcp_servers (id TEXT PRIMARY KEY, name TEXT NOT NULL, url TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS plugins (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', author TEXT NOT NULL DEFAULT '', repo_url TEXT, manifest TEXT NOT NULL DEFAULT '', permissions TEXT NOT NULL DEFAULT '', has_executable_code INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS bot_skills (bot_id TEXT NOT NULL, skill_id TEXT NOT NULL, PRIMARY KEY (bot_id, skill_id));
    CREATE TABLE IF NOT EXISTS bot_connections (bot_id TEXT NOT NULL, connection_id TEXT NOT NULL, PRIMARY KEY (bot_id, connection_id));
    CREATE TABLE IF NOT EXISTS bot_mcp_tools (bot_id TEXT NOT NULL, server_id TEXT NOT NULL, tool_name TEXT NOT NULL, PRIMARY KEY (bot_id, server_id, tool_name));
    CREATE TABLE IF NOT EXISTS group_threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS group_members (thread_id TEXT NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, PRIMARY KEY (thread_id, bot_id));
    CREATE TABLE IF NOT EXISTS group_messages (id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES group_threads(id) ON DELETE CASCADE, bot_id TEXT REFERENCES bots(id) ON DELETE SET NULL, role TEXT NOT NULL, text TEXT NOT NULL, approval_state TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS model_setups (id TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT NOT NULL DEFAULT '', context_window INTEGER NOT NULL DEFAULT 8192, created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS idx_chats_bot ON chats(bot_id, updated_at);
    CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_group_messages ON group_messages(thread_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_routines_bot ON routines(bot_id, status);
  `);
  // Best-effort migration for skills created before the connections brief:
  // add source / repo_url / permissions columns if they are not there yet.
  for (const sql of [
    'ALTER TABLE bots ADD COLUMN endpoint TEXT',
    'ALTER TABLE bots ADD COLUMN avatar TEXT',
    'ALTER TABLE skills ADD COLUMN source TEXT NOT NULL DEFAULT \'local\'',
    'ALTER TABLE skills ADD COLUMN repo_url TEXT',
    'ALTER TABLE skills ADD COLUMN permissions TEXT NOT NULL DEFAULT \'\'',
  ]) {
    try { await db.execAsync(sql); } catch { /* column already exists */ }
  }
  return db;
}

// Delete account (user order 2026-10-31): wipe every local table,
// keeping the schema so the next launch re-seeds the default bots.
// Callers delete SecureStore secrets and the workspace directory
// separately — this only clears SQLite.
export async function wipeAllData(): Promise<void> {
  const db = await getDb();
  for (const table of [
    'messages', 'group_messages', 'bot_memory', 'bot_skills',
    'bot_connections', 'bot_mcp_tools', 'group_members',
    'chats', 'group_threads', 'skills', 'routines', 'connections',
    'mcp_servers', 'plugins', 'model_setups', 'bots', 'settings',
  ]) {
    try { await db.execAsync(`DELETE FROM ${table}`); } catch { /* keep wiping the rest */ }
  }
}

function botRow(r: any): Bot {
  return {
    id: r.id, name: r.name, role: r.role, avatarColor: r.avatar_color, avatarIcon: r.avatar_icon, avatar: r.avatar ?? undefined,
    task: r.task, personality: r.personality, instructions: r.instructions, boundaries: r.boundaries,
    provider: r.provider, model: r.model, endpoint: r.endpoint ?? undefined, isPinned: r.is_pinned, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

export async function listBots(search = ''): Promise<Bot[]> {
  const d = await getDb();
  const rows = search
    ? await d.getAllAsync('SELECT * FROM bots WHERE name LIKE ? OR role LIKE ? ORDER BY is_pinned DESC, updated_at DESC', [`%${search}%`, `%${search}%`])
    : await d.getAllAsync('SELECT * FROM bots ORDER BY is_pinned DESC, updated_at DESC');
  return rows.map(botRow);
}

export async function getBot(id: string): Promise<Bot | null> {
  const d = await getDb();
  const row = await d.getFirstAsync('SELECT * FROM bots WHERE id = ?', [id]);
  return row ? botRow(row) : null;
}

export async function saveBot(bot: Bot): Promise<void> {
  const d = await getDb();
  await d.runAsync(
    'INSERT OR REPLACE INTO bots (id, name, role, avatar_color, avatar_icon, avatar, task, personality, instructions, boundaries, provider, model, endpoint, is_pinned, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
    [bot.id, bot.name, bot.role, bot.avatarColor, bot.avatarIcon, bot.avatar ?? null, bot.task, bot.personality, bot.instructions, bot.boundaries, bot.provider, bot.model, bot.endpoint ?? null, bot.isPinned, bot.createdAt, bot.updatedAt],
  );
}

export async function deleteBot(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM messages WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM chats WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM routines WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM bot_memory WHERE bot_id = ?', [id]);
  // SECURITY FIX 2026-10-28: previously the junction rows below were left
  // behind (SQLite foreign-key enforcement is off by default), so a deleted
  // bot's skill/connection/tool links and group membership survived.
  await d.runAsync('DELETE FROM bot_skills WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM bot_connections WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM bot_mcp_tools WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM group_members WHERE bot_id = ?', [id]);
  await d.runAsync('UPDATE group_messages SET bot_id = NULL WHERE bot_id = ?', [id]);
  await d.runAsync('DELETE FROM bots WHERE id = ?', [id]);
}

export async function listChats(botId?: string): Promise<Chat[]> {
  const d = await getDb();
  const rows = botId
    ? await d.getAllAsync('SELECT * FROM chats WHERE bot_id = ? ORDER BY updated_at DESC', [botId])
    : await d.getAllAsync('SELECT * FROM chats ORDER BY updated_at DESC');
  return rows.map((r: any) => ({ id: r.id, botId: r.bot_id, title: r.title, status: r.status, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function getOrCreateChat(botId: string): Promise<Chat> {
  const d = await getDb();
  const existing = await d.getFirstAsync("SELECT * FROM chats WHERE bot_id = ? AND status = 'active' ORDER BY updated_at DESC LIMIT 1", [botId]) as any;
  if (existing) return { id: existing.id, botId: existing.bot_id, title: existing.title, status: existing.status, createdAt: existing.created_at, updatedAt: existing.updated_at };
  const chat: Chat = { id: newId(), botId, title: 'New chat', status: 'active', createdAt: nowIso(), updatedAt: nowIso() };
  await d.runAsync('INSERT INTO chats (id, bot_id, title, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [chat.id, chat.botId, chat.title, chat.status, chat.createdAt, chat.updatedAt]);
  return chat;
}

// A brand-new thread for a bot (user order 2026-10-30: drawer New
// chat → Bots list → any bot opens a completely new chat). Always
// inserts, never reuses the latest thread. Old threads stay in
// History, openable by id below — nothing is deleted by going new.
export async function createChat(botId: string): Promise<Chat> {
  const d = await getDb();
  const chat: Chat = { id: newId(), botId, title: 'New chat', status: 'active', createdAt: nowIso(), updatedAt: nowIso() };
  await d.runAsync('INSERT INTO chats (id, bot_id, title, status, created_at, updated_at) VALUES (?,?,?,?,?,?)', [chat.id, chat.botId, chat.title, chat.status, chat.createdAt, chat.updatedAt]);
  return chat;
}

// One specific bot thread, for History rows: without this, every
// History row for a bot would open its latest thread and old threads
// would be listed but unreachable.
export async function getChat(id: string): Promise<Chat | null> {
  const d = await getDb();
  const row = await d.getFirstAsync("SELECT * FROM chats WHERE id = ? AND status = 'active'", [id]) as any;
  return row ? { id: row.id, botId: row.bot_id, title: row.title, status: row.status, createdAt: row.created_at, updatedAt: row.updated_at } : null;
}

export async function listMessages(chatId: string): Promise<Message[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC', [chatId]);
  return rows.map((r: any) => ({ id: r.id, chatId: r.chat_id, botId: r.bot_id, role: r.role, text: r.text, approvalState: r.approval_state, createdAt: r.created_at }));
}

// Every Main Chat thread, newest first: the original 'universal-chat'
// plus every 'universal-<id>' thread a New chat created. A thread with
// no messages cannot exist (New chat does nothing on an empty thread),
// so every row here has a last message to show as its snippet.
export async function listUniversalChats(): Promise<{ id: string; snippet: string; lastAt: string; title: string | null }[]> {
  const d = await getDb();
  const rows = await d.getAllAsync(
    "SELECT chat_id AS id, MAX(created_at) AS last_at FROM messages WHERE chat_id LIKE 'universal-%' GROUP BY chat_id ORDER BY last_at DESC",
  ) as any[];
  const out: { id: string; snippet: string; lastAt: string; title: string | null }[] = [];
  for (const r of rows) {
    const msgs = await listMessages(r.id);
    const last = msgs[msgs.length - 1];
    const title = await getUniversalTitle(r.id).catch(() => null);
    out.push({ id: r.id, snippet: last ? last.text : 'No messages yet.', lastAt: r.last_at, title: title?.trim() ? title : null });
  }
  return out;
}

export async function addMessage(m: Message): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT INTO messages (id, chat_id, bot_id, role, text, approval_state, created_at) VALUES (?,?,?,?,?,?,?)', [m.id, m.chatId, m.botId, m.role, m.text, m.approvalState, m.createdAt]);
  await d.runAsync('UPDATE chats SET updated_at = ? WHERE id = ?', [m.createdAt, m.chatId]);
}

export async function setMessageApproval(id: string, state: 'approved' | 'rejected'): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE messages SET approval_state = ? WHERE id = ?', [state, id]);
}

export async function archiveChat(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync("UPDATE chats SET status = 'archived' WHERE id = ?", [id]);
}

// ---- Thread menu helpers (History / header menu, 2026-10-29) ----
// Main Chat threads have no chats-table row (their messages live under
// 'universal-*' ids), so their titles live in settings and their
// pinned state in one JSON list shared by all thread kinds. Bot chats
// rename their chats row; group threads rename their own row. Delete
// removes the thread's messages (and its row, where one exists) and
// never touches any other thread.
export async function getUniversalTitle(id: string): Promise<string | null> {
  return getSetting(`universal_title_${id}`);
}

export async function setUniversalTitle(id: string, title: string): Promise<void> {
  await setSetting(`universal_title_${id}`, title);
}

export async function getPinnedThreads(): Promise<string[]> {
  try {
    const raw = await getSetting('pinned_threads');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch { return []; }
}

export async function togglePinThread(id: string): Promise<boolean> {
  const pinned = await getPinnedThreads();
  const next = pinned.includes(id) ? pinned.filter((x) => x !== id) : [...pinned, id];
  await setSetting('pinned_threads', JSON.stringify(next));
  return next.includes(id);
}

export async function deleteUniversalThread(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM messages WHERE chat_id = ?', [id]);
  await setSetting(`universal_title_${id}`, '');
}

export async function renameChat(id: string, title: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE chats SET title = ? WHERE id = ?', [title, id]);
}

export async function deleteChat(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM messages WHERE chat_id = ?', [id]);
  await d.runAsync('DELETE FROM chats WHERE id = ?', [id]);
}

export async function renameGroupThread(id: string, title: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE group_threads SET title = ? WHERE id = ?', [title, id]);
}

export async function listSkills(botId?: string): Promise<Skill[]> {
  const d = await getDb();
  const rows = botId ? await d.getAllAsync('SELECT * FROM skills WHERE bot_id = ? ORDER BY created_at DESC', [botId]) : await d.getAllAsync('SELECT * FROM skills ORDER BY created_at DESC');
  return rows.map((r: any) => ({ id: r.id, botId: r.bot_id, name: r.name, template: r.template, source: r.source ?? 'local', repoUrl: r.repo_url ?? null, permissions: r.permissions ?? '', createdAt: r.created_at }));
}

export async function saveSkill(s: Skill): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO skills (id, bot_id, name, template, source, repo_url, permissions, created_at) VALUES (?,?,?,?,?,?,?,?)', [s.id, s.botId, s.name, s.template, s.source, s.repoUrl, s.permissions, s.createdAt]);
}

export async function deleteSkill(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM skills WHERE id = ?', [id]);
  await d.runAsync('DELETE FROM bot_skills WHERE skill_id = ?', [id]);
}

export async function listConnections(): Promise<Connection[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM connections ORDER BY created_at DESC');
  return rows.map((r: any) => ({ id: r.id, name: r.name, service: r.service, scope: r.scope, permissions: r.permissions, createdAt: r.created_at }));
}

export async function saveConnection(c: Connection): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO connections (id, name, service, scope, permissions, created_at) VALUES (?,?,?,?,?,?)', [c.id, c.name, c.service, c.scope, c.permissions, c.createdAt]);
}

export async function deleteConnection(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM connections WHERE id = ?', [id]);
  await d.runAsync('DELETE FROM bot_connections WHERE connection_id = ?', [id]);
}

export async function listMcpServers(): Promise<McpServer[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM mcp_servers ORDER BY created_at DESC');
  return rows.map((r: any) => ({ id: r.id, name: r.name, url: r.url, createdAt: r.created_at }));
}

export async function saveMcpServer(s: McpServer): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO mcp_servers (id, name, url, created_at) VALUES (?,?,?,?)', [s.id, s.name, s.url, s.createdAt]);
}

export async function deleteMcpServer(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM mcp_servers WHERE id = ?', [id]);
  await d.runAsync('DELETE FROM bot_mcp_tools WHERE server_id = ?', [id]);
}

export async function listPlugins(): Promise<Plugin[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM plugins ORDER BY created_at DESC');
  return rows.map((r: any) => ({ id: r.id, name: r.name, description: r.description, author: r.author, repoUrl: r.repo_url, manifest: r.manifest, permissions: r.permissions, hasExecutableCode: r.has_executable_code === 1, createdAt: r.created_at }));
}

export async function savePlugin(p: Plugin): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO plugins (id, name, description, author, repo_url, manifest, permissions, has_executable_code, created_at) VALUES (?,?,?,?,?,?,?,?,?)', [p.id, p.name, p.description, p.author, p.repoUrl, p.manifest, p.permissions, p.hasExecutableCode ? 1 : 0, p.createdAt]);
}

export async function listBotSkillIds(botId: string): Promise<string[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT skill_id FROM bot_skills WHERE bot_id = ?', [botId]);
  return rows.map((r: any) => r.skill_id as string);
}

export async function toggleBotSkill(botId: string, skillId: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  if (enabled) await d.runAsync('INSERT OR IGNORE INTO bot_skills (bot_id, skill_id) VALUES (?,?)', [botId, skillId]);
  else await d.runAsync('DELETE FROM bot_skills WHERE bot_id = ? AND skill_id = ?', [botId, skillId]);
}

export async function listBotConnectionIds(botId: string): Promise<string[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT connection_id FROM bot_connections WHERE bot_id = ?', [botId]);
  return rows.map((r: any) => r.connection_id as string);
}

export async function toggleBotConnection(botId: string, connectionId: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  if (enabled) await d.runAsync('INSERT OR IGNORE INTO bot_connections (bot_id, connection_id) VALUES (?,?)', [botId, connectionId]);
  else await d.runAsync('DELETE FROM bot_connections WHERE bot_id = ? AND connection_id = ?', [botId, connectionId]);
}

export async function listBotMcpTools(botId: string): Promise<{ serverId: string; toolName: string }[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT server_id, tool_name FROM bot_mcp_tools WHERE bot_id = ?', [botId]);
  return rows.map((r: any) => ({ serverId: r.server_id, toolName: r.tool_name }));
}

export async function toggleBotMcpTool(botId: string, serverId: string, toolName: string, enabled: boolean): Promise<void> {
  const d = await getDb();
  if (enabled) await d.runAsync('INSERT OR IGNORE INTO bot_mcp_tools (bot_id, server_id, tool_name) VALUES (?,?,?)', [botId, serverId, toolName]);
  else await d.runAsync('DELETE FROM bot_mcp_tools WHERE bot_id = ? AND server_id = ? AND tool_name = ?', [botId, serverId, toolName]);
}

export async function listRoutines(): Promise<Routine[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM routines ORDER BY created_at DESC');
  return rows.map((r: any) => ({ id: r.id, botId: r.bot_id, skillId: r.skill_id, name: r.name, schedule: r.schedule, status: r.status, lastRunAt: r.last_run_at, createdAt: r.created_at }));
}

export async function saveRoutine(r: Routine): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO routines (id, bot_id, skill_id, name, schedule, status, last_run_at, created_at) VALUES (?,?,?,?,?,?,?,?)', [r.id, r.botId, r.skillId, r.name, r.schedule, r.status, r.lastRunAt, r.createdAt]);
}

export async function setRoutineStatus(id: string, status: 'active' | 'paused'): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE routines SET status = ? WHERE id = ?', [status, id]);
}

export async function markRoutineRun(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE routines SET last_run_at = ? WHERE id = ?', [nowIso(), id]);
}

export async function listMemory(botId: string): Promise<MemoryNote[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM bot_memory WHERE bot_id = ? ORDER BY created_at DESC', [botId]);
  return rows.map((r: any) => ({ id: r.id, botId: r.bot_id, note: r.note, source: r.source, createdAt: r.created_at }));
}

export async function addMemory(botId: string, note: string, source: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT INTO bot_memory (id, bot_id, note, source, created_at) VALUES (?,?,?,?,?)', [newId(), botId, note, source, nowIso()]);
}

export async function deleteMemory(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM bot_memory WHERE id = ?', [id]);
}

export async function getSetting(key: string): Promise<string | null> {
  const d = await getDb();
  const row = await d.getFirstAsync('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? (row as any).value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT OR REPLACE INTO settings (key, value) VALUES (?,?)', [key, value]);
}

// ---- Group chat (added for the remaining-work pass, 2026-10-27) ----
export async function listGroupThreads(): Promise<GroupThread[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM group_threads ORDER BY updated_at DESC');
  return rows.map((r: any) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function createGroupThread(title: string, botIds: string[]): Promise<GroupThread> {
  const d = await getDb();
  const t: GroupThread = { id: newId(), title: title.trim() || 'Group chat', createdAt: nowIso(), updatedAt: nowIso() };
  await d.runAsync('INSERT INTO group_threads (id, title, created_at, updated_at) VALUES (?,?,?,?)', [t.id, t.title, t.createdAt, t.updatedAt]);
  for (const botId of botIds) {
    await d.runAsync('INSERT OR IGNORE INTO group_members (thread_id, bot_id) VALUES (?,?)', [t.id, botId]);
  }
  return t;
}

export async function deleteGroupThread(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM group_messages WHERE thread_id = ?', [id]);
  await d.runAsync('DELETE FROM group_members WHERE thread_id = ?', [id]);
  await d.runAsync('DELETE FROM group_threads WHERE id = ?', [id]);
}

export async function listGroupMembers(threadId: string): Promise<Bot[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT b.* FROM bots b JOIN group_members m ON m.bot_id = b.id WHERE m.thread_id = ? ORDER BY b.name ASC', [threadId]);
  return rows.map(botRow);
}

export async function listGroupMessages(threadId: string): Promise<GroupMessage[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM group_messages WHERE thread_id = ? ORDER BY created_at ASC', [threadId]);
  return rows.map((r: any) => ({ id: r.id, threadId: r.thread_id, botId: r.bot_id, role: r.role, text: r.text, approvalState: r.approval_state, createdAt: r.created_at }));
}

export async function addGroupMessage(m: GroupMessage): Promise<void> {
  const d = await getDb();
  await d.runAsync('INSERT INTO group_messages (id, thread_id, bot_id, role, text, approval_state, created_at) VALUES (?,?,?,?,?,?,?)', [m.id, m.threadId, m.botId, m.role, m.text, m.approvalState, m.createdAt]);
  await d.runAsync('UPDATE group_threads SET updated_at = ? WHERE id = ?', [m.createdAt, m.threadId]);
}

export async function setGroupMessageApproval(id: string, state: 'approved' | 'rejected'): Promise<void> {
  const d = await getDb();
  await d.runAsync('UPDATE group_messages SET approval_state = ? WHERE id = ?', [state, id]);
}
