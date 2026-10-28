import { Bot, ProviderId } from './types';
import { getApiKey } from './keys';

export class ProviderError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

function cleanError(status: number): ProviderError {
  if (status === 401 || status === 403) return new ProviderError('INVALID_KEY', 'Your API key was rejected. Check the key in Settings and try again.');
  if (status === 429) return new ProviderError('RATE_LIMIT', 'The provider rate-limited this request (429). Wait a bit and try again. No retry loop was run.');
  if (status === 402) return new ProviderError('BILLING', 'The provider reports a billing / credit problem. Check your provider account.');
  return new ProviderError('PROVIDER_ERROR', `The provider returned HTTP ${status}.`);
}

const OPENAI_DEFAULT_ENDPOINT = 'https://api.openai.com/v1/chat/completions';

// Validate an OpenAI-compatible endpoint: https only, no query/fragment.
// A non-https or credential-carrying URL must never receive an API key.
function resolveOpenAiEndpoint(bot: Bot): string {
  const endpoint = bot.endpoint?.trim() || OPENAI_DEFAULT_ENDPOINT;
  if (!/^https:\/\/[^/?#\s]+(\/[^?#\s]*)?$/.test(endpoint)) {
    throw new ProviderError('BAD_ENDPOINT', 'That bot has an invalid API endpoint. Use an https:// URL with no query string, or leave the endpoint blank for OpenAI.');
  }
  return endpoint;
}

// One call, no retry loop. Network failures surface as a clear message.
export async function chatWithBot(bot: Bot, systemPrompt: string, history: { role: string; text: string }[], userText: string): Promise<string> {
  const key = await getApiKey(bot.provider);
  if (!key) throw new ProviderError('NO_KEY', 'No API key set for this provider. Add your own key in Settings — TeamBots does not supply one.');
  const provider = bot.provider as ProviderId;
  // Never fall through to OpenAI for an unknown provider value: a key
  // intended for one provider must never be sent to a different host.
  if (provider !== 'anthropic' && provider !== 'gemini' && provider !== 'openai-compatible') {
    throw new ProviderError('BAD_PROVIDER', 'That bot has an unknown provider. Pick one of: openai-compatible, anthropic, gemini.');
  }
  try {
    if (provider === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: bot.model, max_tokens: 1024, system: systemPrompt, messages: [...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })), { role: 'user', content: userText }] }),
      });
      if (!res.ok) throw cleanError(res.status);
      const data: any = await res.json();
      return data.content?.map((c: any) => c.text ?? '').join('') || '(empty reply)';
    }
    if (provider === 'gemini') {
      // SECURITY FIX 2026-10-28: the key used to travel in the URL query
      // string, where it can land in logs. It now travels in a header only,
      // and the model name is URL-encoded so it cannot break out of the path.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(bot.model)}:generateContent`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents: [...history.map((h) => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.text }] })), { role: 'user', parts: [{ text: userText }] }] }),
      });
      if (!res.ok) throw cleanError(res.status);
      const data: any = await res.json();
      return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') || '(empty reply)';
    }
    // OpenAI-compatible: the endpoint is the bot's own (validated, https)
    // endpoint, defaulting to OpenAI. Previously this always called
    // api.openai.com even for a Groq/OpenRouter/DeepSeek/xAI key — a key
    // intended for another provider was sent to OpenAI. Fixed 2026-10-28.
    const res = await fetch(resolveOpenAiEndpoint(bot), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: bot.model,
        messages: [{ role: 'system', content: systemPrompt }, ...history.map((h) => ({ role: h.role === 'assistant' ? 'assistant' : 'user', content: h.text })), { role: 'user', content: userText }],
      }),
    });
    if (!res.ok) throw cleanError(res.status);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '(empty reply)';
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    throw new ProviderError('NETWORK', 'No network or the provider could not be reached. Check your connection and try again.');
  }
}

// Bot browsing: fetch a PUBLIC page on the device, strip tags, truncate.
// No paywall/CAPTCHA bypass, no login, no password handling. If the fetch
// fails or looks like a login wall, the caller shows that plainly.
export async function fetchPublicPageText(url: string): Promise<{ title: string; text: string; url: string }> {
  if (!/^https?:\/\//i.test(url)) throw new ProviderError('BAD_URL', 'Only http(s) URLs can be browsed.');
  const res = await fetch(url, { headers: { 'User-Agent': 'TeamBots/0.1 (public page reader)' } });
  if (res.status === 401 || res.status === 403) throw new ProviderError('LOGIN_REQUIRED', 'This page needs a login or blocks automated reading. Open it yourself in the Browser tab instead — the Bot will not sign in for you.');
  if (!res.ok) throw new ProviderError('PAGE_ERROR', `Could not load that page (HTTP ${res.status}).`);
  const html = await res.text();
  const title = (html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] ?? url).trim();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 6000);
  if (!text) throw new ProviderError('PAGE_EMPTY', 'That page had no readable text.');
  return { title, text, url };
}
