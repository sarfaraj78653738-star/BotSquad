import { getSetting, setSetting } from './db';

export type UniversalConfig = {
  provider: 'openai-compatible' | 'anthropic' | 'gemini';
  model: string;
  endpoint: string;
  contextWindow: number;
};

const PROVIDERS = ['openai-compatible', 'anthropic', 'gemini'] as const;

function clampContextWindow(value: number): number {
  if (!Number.isFinite(value)) return 8192;
  return Math.min(1000000, Math.max(1024, Math.floor(value)));
}

export async function getUniversal(): Promise<UniversalConfig> {
  const providerRaw = await getSetting('universal_provider');
  const provider = (PROVIDERS as readonly string[]).includes(providerRaw ?? '')
    ? (providerRaw as UniversalConfig['provider'])
    : 'openai-compatible';
  const model = (await getSetting('universal_model'))?.trim() || 'gpt-4o-mini';
  const endpoint = (await getSetting('universal_endpoint')) ?? '';
  const windowRaw = await getSetting('universal_context_window');
  const parsed = windowRaw === null ? NaN : parseInt(windowRaw, 10);
  return { provider, model, endpoint, contextWindow: clampContextWindow(parsed) };
}

export async function setUniversal(patch: Partial<UniversalConfig>): Promise<void> {
  if (patch.provider !== undefined) await setSetting('universal_provider', patch.provider);
  if (patch.model !== undefined) await setSetting('universal_model', patch.model);
  if (patch.endpoint !== undefined) await setSetting('universal_endpoint', patch.endpoint);
  if (patch.contextWindow !== undefined) await setSetting('universal_context_window', String(clampContextWindow(patch.contextWindow)));
}

// Drop oldest messages first until the estimated token count
// (chars / 4, system + history + user) fits within contextWindow.
// At least the newest message is always kept.
export function capHistory(
  history: { role: string; text: string }[],
  systemPrompt: string,
  userText: string,
  contextWindow: number,
): { role: string; text: string }[] {
  const estimate = (s: string) => s.length / 4;
  const capped = [...history];
  let total = estimate(systemPrompt) + estimate(userText) + capped.reduce((sum, m) => sum + estimate(m.text), 0);
  while (capped.length > 1 && total > contextWindow) {
    const dropped = capped.shift();
    if (dropped) total -= estimate(dropped.text);
  }
  return capped;
}
