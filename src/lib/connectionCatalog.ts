import { Feather } from '@expo/vector-icons';

// Connection catalog (user order 2026-10-29): the old Connections
// screen was a blank name/service/key form nobody could understand.
// Now the screen looks like a connector list: services you can
// connect, each with a plain line about what it is for and what kind
// of key it needs. Only services that work with a single API token
// are listed. Login-based services (Gmail, Instagram, Vercel, and
// the like) are NOT here on purpose: they need OAuth login, which a
// phone-local app with no server cannot do — offering them as a key
// field would be a fake connection.
export type CatalogService = {
  service: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  blurb: string;
  keyHint: string;
};

export const CONNECTION_CATALOG: CatalogService[] = [
  { service: 'GitHub', icon: 'github', blurb: 'Code repos, issues, and pull requests.', keyHint: 'Personal access token (GitHub → Settings → Developer settings → Tokens)' },
  { service: 'GitLab', icon: 'gitlab', blurb: 'Code repos, issues, and merge requests.', keyHint: 'Personal access token (GitLab → Preferences → Access Tokens)' },
  { service: 'Slack', icon: 'slack', blurb: 'Team channels and messages.', keyHint: 'Bot token, starts with xoxb- (Slack app → OAuth & Permissions)' },
  { service: 'Discord', icon: 'message-circle', blurb: 'Server channels and messages.', keyHint: 'Bot token (Discord Developer Portal → Bot)' },
  { service: 'Telegram', icon: 'send', blurb: 'Bot messages and channels.', keyHint: 'Bot token from BotFather' },
  { service: 'Notion', icon: 'file-text', blurb: 'Pages and databases.', keyHint: 'Internal integration token (Notion → Settings → Integrations)' },
  { service: 'Stripe', icon: 'credit-card', blurb: 'Payments and customers.', keyHint: 'Restricted secret key (Stripe → Developers → API keys)' },
  { service: 'Shopify', icon: 'shopping-bag', blurb: 'Store products and orders.', keyHint: 'Admin API access token (custom app in the store)' },
  { service: 'Airtable', icon: 'grid', blurb: 'Tables and records.', keyHint: 'Personal access token (Airtable → Account → API)' },
  { service: 'Linear', icon: 'zap', blurb: 'Issues and projects.', keyHint: 'API key (Linear → Settings → API)' },
];

export function catalogFor(service: string): CatalogService | undefined {
  return CONNECTION_CATALOG.find((c) => c.service.toLowerCase() === service.toLowerCase());
}
