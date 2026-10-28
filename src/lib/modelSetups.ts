import { getDb } from './db';
import { newId, nowIso } from './types';
import { UniversalConfig } from './universal';

// Saved model setups (Settings -> Model setup). A setup is a provider +
// model + endpoint + context window ONLY. The API key is NEVER stored
// here: keys live only in the device secure store, one per provider
// (see src/lib/keys.ts). That is safe in practice because one provider
// key works for every model on that provider (for example one OpenRouter
// key works for all OpenRouter models), so a saved setup never needs
// its own key copy. Activating a setup only switches the universal
// config; the chat then uses that provider's stored key.
export type ModelSetup = {
  id: string;
  provider: UniversalConfig['provider'];
  model: string;
  endpoint: string;
  contextWindow: number;
  createdAt: string;
};

function rowToSetup(r: any): ModelSetup {
  return {
    id: r.id,
    provider: r.provider,
    model: r.model,
    endpoint: r.endpoint ?? '',
    contextWindow: r.context_window,
    createdAt: r.created_at,
  };
}

export async function listModelSetups(): Promise<ModelSetup[]> {
  const d = await getDb();
  const rows = await d.getAllAsync('SELECT * FROM model_setups ORDER BY created_at DESC');
  return rows.map(rowToSetup);
}

// Save a setup, or update the matching one (same provider + model +
// endpoint) instead of creating a duplicate row for it.
export async function saveModelSetup(s: Omit<ModelSetup, 'id' | 'createdAt'>): Promise<ModelSetup> {
  const d = await getDb();
  const existing = await d.getFirstAsync(
    'SELECT * FROM model_setups WHERE provider = ? AND model = ? AND endpoint = ?',
    [s.provider, s.model, s.endpoint],
  ) as any;
  if (existing) {
    await d.runAsync('UPDATE model_setups SET context_window = ? WHERE id = ?', [s.contextWindow, existing.id]);
    return { ...rowToSetup(existing), contextWindow: s.contextWindow };
  }
  const setup: ModelSetup = { ...s, id: newId(), createdAt: nowIso() };
  await d.runAsync(
    'INSERT INTO model_setups (id, provider, model, endpoint, context_window, created_at) VALUES (?,?,?,?,?,?)',
    [setup.id, setup.provider, setup.model, setup.endpoint, setup.contextWindow, setup.createdAt],
  );
  return setup;
}

export async function deleteModelSetup(id: string): Promise<void> {
  const d = await getDb();
  await d.runAsync('DELETE FROM model_setups WHERE id = ?', [id]);
}
