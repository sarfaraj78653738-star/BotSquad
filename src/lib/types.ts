export type ProviderId = 'openai-compatible' | 'anthropic' | 'gemini';

export interface Bot {
  id: string;
  name: string;
  role: string;
  avatarColor: string;
  avatarIcon: string;
  task: string;
  personality: string;
  instructions: string;
  boundaries: string;
  provider: ProviderId;
  model: string;
  // Optional API endpoint for the OpenAI-compatible provider only.
  // Defaults to OpenAI. Must be https:// with no query string — a query
  // string could carry credentials in a logged URL. See providers.ts.
  endpoint?: string;
  isPinned: number;
  createdAt: string;
  updatedAt: string;
}

export interface Chat {
  id: string;
  botId: string;
  title: string;
  status: 'active' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  botId: string;
  role: 'user' | 'assistant' | 'system_note';
  text: string;
  approvalState: 'draft' | 'approved' | 'rejected' | null;
  createdAt: string;
}

export interface Skill {
  id: string;
  botId: string | null;
  name: string;
  template: string;
  source: 'local' | 'github' | 'mcp';
  repoUrl: string | null;
  permissions: string;
  createdAt: string;
}

export interface Connection {
  id: string;
  name: string;
  service: string;
  scope: 'global' | 'per-bot';
  permissions: string;
  createdAt: string;
}

export interface McpServer {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface McpTool {
  name: string;
  description: string;
  serverId: string;
}

export interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  repoUrl: string | null;
  manifest: string;
  permissions: string;
  hasExecutableCode: boolean;
  createdAt: string;
}

export interface Routine {
  id: string;
  botId: string;
  skillId: string | null;
  name: string;
  schedule: string; // 'daily HH:MM' or 'weekday HH:MM'
  status: 'active' | 'paused';
  lastRunAt: string | null;
  createdAt: string;
}

export interface GroupThread {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface GroupMessage {
  id: string;
  threadId: string;
  botId: string | null;
  role: 'user' | 'assistant' | 'system_note';
  text: string;
  approvalState: 'draft' | 'approved' | 'rejected' | null;
  createdAt: string;
}

export interface MemoryNote {
  id: string;
  botId: string;
  note: string;
  source: string;
  createdAt: string;
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export const PROVIDERS: { id: ProviderId; label: string; models: string[]; baseUrl: string }[] = [
  {
    id: 'openai-compatible',
    label: 'OpenAI-compatible (OpenAI, Groq, OpenRouter, DeepSeek, xAI)',
    models: ['gpt-4o-mini', 'llama-3.3-70b-versatile', 'deepseek-chat'],
    baseUrl: 'https://api.openai.com/v1/chat/completions',
  },
  { id: 'anthropic', label: 'Anthropic', models: [], baseUrl: 'https://api.anthropic.com/v1/messages' },
  { id: 'gemini', label: 'Google Gemini', models: ['gemini-2.0-flash'], baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models' },
];

export const BOT_TEMPLATES: Omit<Bot, 'id' | 'createdAt' | 'updatedAt' | 'isPinned'>[] = [
  {
    name: 'Chief of Staff',
    role: 'Chief of Staff',
    avatarColor: '#E7DCC8',
    avatarIcon: '◆',
    task: 'Coordinate the team, prepare meeting briefs, and turn scattered notes into a clear plan.',
    personality: 'Calm, concise, and organised. Lead with the decision, then the reasons.',
    instructions: 'Summarise first, then list owners and next steps.',
    boundaries: 'Never send, publish, buy, or delete anything externally. Drafts need user approval.',
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
  },
  {
    name: 'Inbox Helper',
    role: 'Inbox Manager',
    avatarColor: '#DDE7DC',
    avatarIcon: '●',
    task: 'Triage messages and draft replies for the user to approve.',
    personality: 'Helpful and brief. Keep drafts short and polite.',
    instructions: 'Draft only. Flag anything urgent separately.',
    boundaries: 'Never send a message. Every draft waits for approval.',
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
  },
  {
    name: 'Sales Helper',
    role: 'Sales Outbound',
    avatarColor: '#E3DDE8',
    avatarIcon: '▲',
    task: 'Research accounts and draft outreach messages.',
    personality: 'Confident and specific. No generic flattery, one clear ask per draft.',
    instructions: 'Use only facts the user provides or pages the user shares.',
    boundaries: 'Never send outreach. Drafts need user approval.',
    provider: 'openai-compatible',
    model: 'gpt-4o-mini',
  },
];
