import * as SecureStore from 'expo-secure-store';

// Connection credentials (API key / OAuth token) live ONLY in SecureStore,
// keyed by connection id — never in SQLite, never logged, never synced.
// A connection is never used unless the user enables it for that specific Bot
// (see bot_connections in db.ts).
export async function setConnectionToken(connectionId: string, token: string): Promise<void> {
  if (!token.trim()) {
    await SecureStore.deleteItemAsync(`botsquad_conn_${connectionId}`);
    return;
  }
  await SecureStore.setItemAsync(`botsquad_conn_${connectionId}`, token.trim());
}

export async function getConnectionToken(connectionId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`botsquad_conn_${connectionId}`);
  } catch {
    return null;
  }
}

// SECURITY FIX 2026-10-28: deleting a connection/server must revoke its
// token. Previously deleteConnection/deleteMcpServer removed only the DB
// row, leaving the credential in SecureStore indefinitely.
export async function deleteConnectionToken(connectionId: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(`botsquad_conn_${connectionId}`); } catch { /* already gone */ }
}

export async function deleteMcpToken(serverId: string): Promise<void> {
  try { await SecureStore.deleteItemAsync(`botsquad_mcp_${serverId}`); } catch { /* already gone */ }
}

export async function setMcpToken(serverId: string, token: string): Promise<void> {
  if (!token.trim()) {
    await SecureStore.deleteItemAsync(`botsquad_mcp_${serverId}`);
    return;
  }
  await SecureStore.setItemAsync(`botsquad_mcp_${serverId}`, token.trim());
}

export async function getMcpToken(serverId: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(`botsquad_mcp_${serverId}`);
  } catch {
    return null;
  }
}
