import { Feather } from '@expo/vector-icons';

// Connector catalog (user order 2026-10-29: "add as many connectors
// as you can"). Every service here works with details the user can
// paste in — an API key/token, or a small set of fields — and every
// one is VERIFIED live when the user taps Connect (see
// connectionVerify.ts): the app calls the service's own API with the
// supplied details, and the connection is only built when the service
// accepts them. A wrong key fails with a clear error instead of a
// fake "connected" row.
// Deliberately NOT here: login-only (OAuth) services — Gmail,
// Instagram, Facebook, LinkedIn, YouTube, and the like. They cannot be
// verified from a phone-local app with no server, and offering them as
// a key field would be a fake connection. They stay named in the
// on-screen note, never faked.
export type CatalogField = {
  key: string;
  label: string;
  secure?: boolean;
  placeholder?: string;
  defaultValue?: string;
};

export type VerifySpec =
  | {
      type: 'api';
      method?: 'GET' | 'POST';
      url: string;
      headers?: Record<string, string>;
      body?: string;
      basic?: [string, string];
      accountPath?: string;
      okPath?: string;
    }
  | {
      type: 'token-exchange';
      tokenUrl: string;
      tokenBody: string;
      basic?: [string, string];
      tokenHeaders?: Record<string, string>;
      meUrl?: string;
      meHeaders?: Record<string, string>;
      accountPath?: string;
    }
  | {
      type: 'session';
      url: string;
      body: string;
      accountPath?: string;
    };

export type CatalogService = {
  service: string;
  category: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  blurb: string;
  keyHint: string;
  fields: CatalogField[];
  verify: VerifySpec;
};

const TOKEN: CatalogField[] = [{ key: 'token', label: 'API key / token', secure: true }];

export const CONNECTION_CATALOG: CatalogService[] = [
  // Code & Deploy
  { service: 'GitHub', category: 'Code & Deploy', icon: 'github', blurb: 'Code repos, issues, and pull requests.', keyHint: 'Personal access token (GitHub → Settings → Developer settings → Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.github.com/user', headers: { Authorization: 'Bearer {token}' }, accountPath: 'login' } },
  { service: 'GitLab', category: 'Code & Deploy', icon: 'gitlab', blurb: 'Code repos, issues, and merge requests.', keyHint: 'Personal access token (GitLab → Preferences → Access Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://gitlab.com/api/v4/user', headers: { Authorization: 'Bearer {token}' }, accountPath: 'username' } },
  { service: 'Bitbucket', category: 'Code & Deploy', icon: 'database', blurb: 'Code repos and pull requests.', keyHint: 'API token (Bitbucket → Personal settings → API tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.bitbucket.org/2.0/user', headers: { Authorization: 'Bearer {token}' }, accountPath: 'display_name' } },
  { service: 'Codeberg', category: 'Code & Deploy', icon: 'code', blurb: 'Code repos on Codeberg.', keyHint: 'Access token (Codeberg → Settings → Applications → Generate Token)', fields: [{ key: 'instance', label: 'Instance', placeholder: 'codeberg.org', defaultValue: 'codeberg.org' }, { key: 'token', label: 'Access token', secure: true }], verify: { type: 'api', url: 'https://{instance}/api/v1/user', headers: { Authorization: 'token {token}' }, accountPath: 'login' } },
  { service: 'Gitea', category: 'Code & Deploy', icon: 'code', blurb: 'Code repos on any Gitea server.', keyHint: 'Access token (your Gitea → Settings → Applications)', fields: [{ key: 'instance', label: 'Instance domain', placeholder: 'gitea.example.com' }, { key: 'token', label: 'Access token', secure: true }], verify: { type: 'api', url: 'https://{instance}/api/v1/user', headers: { Authorization: 'token {token}' }, accountPath: 'login' } },
  { service: 'Vercel', category: 'Code & Deploy', icon: 'triangle', blurb: 'Deploy websites and read projects.', keyHint: 'Token (Vercel → Settings → Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.vercel.com/v2/user', headers: { Authorization: 'Bearer {token}' }, accountPath: 'user.username' } },
  { service: 'Netlify', category: 'Code & Deploy', icon: 'layers', blurb: 'Deploy sites and read projects.', keyHint: 'Personal access token (Netlify → User settings → Applications)', fields: TOKEN, verify: { type: 'api', url: 'https://api.netlify.com/api/v1/user', headers: { Authorization: 'Bearer {token}' }, accountPath: 'full_name' } },
  { service: 'Cloudflare', category: 'Code & Deploy', icon: 'cloud', blurb: 'Zones, DNS, and Pages projects.', keyHint: 'API token (Cloudflare → My Profile → API Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.cloudflare.com/client/v4/user/tokens/verify', headers: { Authorization: 'Bearer {token}' }, okPath: 'success' } },
  { service: 'Render', category: 'Code & Deploy', icon: 'server', blurb: 'Web services and background workers.', keyHint: 'API key (Render → Account Settings → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.render.com/v1/services', headers: { Authorization: 'Bearer {token}' } } },
  { service: 'Supabase', category: 'Code & Deploy', icon: 'database', blurb: 'Database and auth for your project.', keyHint: 'Project URL + anon or service key (Supabase → Project Settings → API)', fields: [{ key: 'url', label: 'Project URL', placeholder: 'https://xyzcompany.supabase.co' }, { key: 'token', label: 'API key', secure: true }], verify: { type: 'api', url: '{url}/rest/v1/', headers: { apikey: '{token}', Authorization: 'Bearer {token}' } } },
  { service: 'Neon', category: 'Code & Deploy', icon: 'database', blurb: 'Postgres databases and projects.', keyHint: 'API key (Neon → Account Settings → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://console.neon.tech/api/v2/projects?limit=1', headers: { Authorization: 'Bearer {token}' } } },

  // Chat & Messages
  { service: 'Slack', category: 'Chat & Messages', icon: 'slack', blurb: 'Team channels and messages.', keyHint: 'Bot token, starts with xoxb- (Slack app → OAuth & Permissions)', fields: TOKEN, verify: { type: 'api', url: 'https://slack.com/api/auth.test', headers: { Authorization: 'Bearer {token}' }, okPath: 'ok', accountPath: 'user' } },
  { service: 'Discord', category: 'Chat & Messages', icon: 'message-circle', blurb: 'Server channels and messages.', keyHint: 'Bot token (Discord Developer Portal → Bot)', fields: TOKEN, verify: { type: 'api', url: 'https://discord.com/api/v10/users/@me', headers: { Authorization: 'Bot {token}' }, accountPath: 'username' } },
  { service: 'Telegram', category: 'Chat & Messages', icon: 'send', blurb: 'Bot messages and channels.', keyHint: 'Bot token from BotFather', fields: TOKEN, verify: { type: 'api', url: 'https://api.telegram.org/bot{token}/getMe', accountPath: 'result.username' } },
  { service: 'Mattermost', category: 'Chat & Messages', icon: 'message-square', blurb: 'Team chat on your own server.', keyHint: 'Personal access token (Mattermost → Profile → Security)', fields: [{ key: 'server', label: 'Server domain', placeholder: 'chat.example.com' }, { key: 'token', label: 'Personal access token', secure: true }], verify: { type: 'api', url: 'https://{server}/api/v4/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'username' } },
  { service: 'Zulip', category: 'Chat & Messages', icon: 'at-sign', blurb: 'Team chat on your own server.', keyHint: 'API key (Zulip → Personal settings → Account & privacy)', fields: [{ key: 'server', label: 'Server domain', placeholder: 'zulip.example.com' }, { key: 'email', label: 'Email' }, { key: 'token', label: 'API key', secure: true }], verify: { type: 'api', url: 'https://{server}/api/v1/users/me', basic: ['email', 'token'], accountPath: 'user.full_name' } },
  { service: 'Rocket.Chat', category: 'Chat & Messages', icon: 'message-square', blurb: 'Team chat on your own server.', keyHint: 'User ID + auth token (Rocket.Chat → My Account → Personal Access Tokens)', fields: [{ key: 'server', label: 'Server domain', placeholder: 'chat.example.com' }, { key: 'userId', label: 'User ID' }, { key: 'authToken', label: 'Auth token', secure: true }], verify: { type: 'api', url: 'https://{server}/api/v1/me', headers: { 'X-User-Id': '{userId}', 'X-Auth-Token': '{authToken}' }, accountPath: 'name' } },
  { service: 'WhatsApp Business', category: 'Chat & Messages', icon: 'phone', blurb: 'Business messages via the WhatsApp Cloud API.', keyHint: 'Phone number ID + permanent access token (Meta Developers → WhatsApp)', fields: [{ key: 'phoneId', label: 'Phone number ID' }, { key: 'token', label: 'Permanent access token', secure: true }], verify: { type: 'api', url: 'https://graph.facebook.com/v19.0/{phoneId}?fields=display_phone_number,verified_name', headers: { Authorization: 'Bearer {token}' }, accountPath: 'verified_name' } },

  // Work & Projects
  { service: 'Notion', category: 'Work & Projects', icon: 'file-text', blurb: 'Pages and databases.', keyHint: 'Internal integration token (Notion → Settings → Integrations)', fields: TOKEN, verify: { type: 'api', url: 'https://api.notion.com/v1/users/me', headers: { Authorization: 'Bearer {token}', 'Notion-Version': '2022-06-28' }, accountPath: 'name' } },
  { service: 'Asana', category: 'Work & Projects', icon: 'check-square', blurb: 'Tasks and projects.', keyHint: 'Personal access token (Asana → My Settings → Apps)', fields: TOKEN, verify: { type: 'api', url: 'https://app.asana.com/api/1.0/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'data.name' } },
  { service: 'ClickUp', category: 'Work & Projects', icon: 'check', blurb: 'Tasks, docs, and goals.', keyHint: 'Personal token (ClickUp → Settings → Apps)', fields: TOKEN, verify: { type: 'api', url: 'https://api.clickup.com/api/v2/user', headers: { Authorization: '{token}' }, accountPath: 'user.username' } },
  { service: 'Linear', category: 'Work & Projects', icon: 'zap', blurb: 'Issues and projects.', keyHint: 'API key (Linear → Settings → API)', fields: TOKEN, verify: { type: 'api', method: 'POST', url: 'https://api.linear.app/graphql', headers: { Authorization: '{token}', 'Content-Type': 'application/json' }, body: '{"query":"{ viewer { name } }"}', accountPath: 'data.viewer.name' } },
  { service: 'Monday', category: 'Work & Projects', icon: 'grid', blurb: 'Boards, items, and updates.', keyHint: 'API token (Monday → Administration → API)', fields: TOKEN, verify: { type: 'api', method: 'POST', url: 'https://api.monday.com/v2', headers: { Authorization: '{token}', 'Content-Type': 'application/json' }, body: '{"query":"{ me { name } }"}', accountPath: 'data.me.name' } },
  { service: 'Todoist', category: 'Work & Projects', icon: 'check', blurb: 'Tasks and projects.', keyHint: 'API token (Todoist → Settings → Integrations)', fields: TOKEN, verify: { type: 'api', url: 'https://api.todoist.com/rest/v2/projects', headers: { Authorization: 'Bearer {token}' } } },
  { service: 'Trello', category: 'Work & Projects', icon: 'trello', blurb: 'Boards, lists, and cards.', keyHint: 'API key + token (Trello → Power-Ups → API key, then authorize)', fields: [{ key: 'key', label: 'API key' }, { key: 'token', label: 'Token', secure: true }], verify: { type: 'api', url: 'https://api.trello.com/1/members/me?key={key}&token={token}', accountPath: 'username' } },
  { service: 'Jira Cloud', category: 'Work & Projects', icon: 'check-square', blurb: 'Issues on your Jira site.', keyHint: 'API token (Atlassian → Profile → Security → API tokens)', fields: [{ key: 'domain', label: 'Site domain', placeholder: 'company.atlassian.net' }, { key: 'email', label: 'Email' }, { key: 'token', label: 'API token', secure: true }], verify: { type: 'api', url: 'https://{domain}/rest/api/3/myself', basic: ['email', 'token'], accountPath: 'displayName' } },
  { service: 'Airtable', category: 'Work & Projects', icon: 'grid', blurb: 'Tables and records.', keyHint: 'Personal access token (Airtable → Account → API)', fields: TOKEN, verify: { type: 'api', url: 'https://api.airtable.com/v0/meta/whoami', headers: { Authorization: 'Bearer {token}' }, accountPath: 'email' } },
  { service: 'Coda', category: 'Work & Projects', icon: 'file-text', blurb: 'Docs and tables.', keyHint: 'API token (Coda → Account Settings → API)', fields: TOKEN, verify: { type: 'api', url: 'https://coda.io/apis/v1/whoami', headers: { Authorization: 'Bearer {token}' }, accountPath: 'name' } },
  { service: 'Smartsheet', category: 'Work & Projects', icon: 'grid', blurb: 'Sheets and reports.', keyHint: 'API access token (Smartsheet → Account → Personal Settings)', fields: TOKEN, verify: { type: 'api', url: 'https://api.smartsheet.com/2.0/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'email' } },
  { service: 'Calendly', category: 'Work & Projects', icon: 'calendar', blurb: 'Scheduling links and events.', keyHint: 'Personal access token (Calendly → Integrations → API & Webhooks)', fields: TOKEN, verify: { type: 'api', url: 'https://api.calendly.com/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'resource.name' } },
  { service: 'Cal.com', category: 'Work & Projects', icon: 'calendar', blurb: 'Bookings and event types.', keyHint: 'API key (Cal.com → Settings → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.cal.com/v1/me?apiKey={token}', accountPath: 'name' } },

  // Payments & Stores
  { service: 'Stripe', category: 'Payments & Stores', icon: 'credit-card', blurb: 'Payments and customers.', keyHint: 'Restricted secret key (Stripe → Developers → API keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.stripe.com/v1/account', headers: { Authorization: 'Bearer {token}' }, accountPath: 'settings.dashboard.display_name' } },
  { service: 'Razorpay', category: 'Payments & Stores', icon: 'credit-card', blurb: 'Payments, orders, and customers.', keyHint: 'Key ID + Key Secret (Razorpay → Settings → API Keys)', fields: [{ key: 'keyId', label: 'Key ID' }, { key: 'secret', label: 'Key Secret', secure: true }], verify: { type: 'api', url: 'https://api.razorpay.com/v1/items?count=1', basic: ['keyId', 'secret'] } },
  { service: 'PayPal', category: 'Payments & Stores', icon: 'credit-card', blurb: 'Live PayPal account (not sandbox).', keyHint: 'Client ID + Secret (PayPal Developer → Apps)', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'secret', label: 'Secret', secure: true }], verify: { type: 'token-exchange', tokenUrl: 'https://api-m.paypal.com/v1/oauth2/token', tokenBody: 'grant_type=client_credentials', basic: ['clientId', 'secret'], tokenHeaders: { 'Content-Type': 'application/x-www-form-urlencoded' } } },
  { service: 'Lemon Squeezy', category: 'Payments & Stores', icon: 'shopping-bag', blurb: 'Payments, products, and customers.', keyHint: 'API key (Lemon Squeezy → Settings → API)', fields: TOKEN, verify: { type: 'api', url: 'https://api.lemonsqueezy.com/v1/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'data.attributes.name' } },
  { service: 'Gumroad', category: 'Payments & Stores', icon: 'shopping-bag', blurb: 'Products and sales.', keyHint: 'Access token (Gumroad → Settings → Advanced)', fields: TOKEN, verify: { type: 'api', url: 'https://api.gumroad.com/v2/user?access_token={token}', okPath: 'success', accountPath: 'user.name' } },
  { service: 'Shopify', category: 'Payments & Stores', icon: 'shopping-bag', blurb: 'Store products and orders.', keyHint: 'Admin API access token (custom app in the store)', fields: [{ key: 'store', label: 'Store domain', placeholder: 'example.myshopify.com' }, { key: 'token', label: 'Admin API access token', secure: true }], verify: { type: 'api', url: 'https://{store}/admin/api/2024-01/shop.json', headers: { 'X-Shopify-Access-Token': '{token}' }, accountPath: 'shop.name' } },

  // Email & Marketing
  { service: 'Mailchimp', category: 'Email & Marketing', icon: 'mail', blurb: 'Audiences and campaigns.', keyHint: 'API key — it ends with your server prefix, like -us12 (Mailchimp → Profile → Extras → API keys)', fields: TOKEN, verify: { type: 'api', url: 'https://{dc}.api.mailchimp.com/3.0/ping', headers: { Authorization: 'apikey {token}' } } },
  { service: 'Typeform', category: 'Email & Marketing', icon: 'file-text', blurb: 'Forms and responses.', keyHint: 'Personal access token (Typeform → Account → Personal Access Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.typeform.com/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'name' } },
  { service: 'SendGrid', category: 'Email & Marketing', icon: 'mail', blurb: 'Email sending and stats.', keyHint: 'API key (SendGrid → Settings → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.sendgrid.com/v3/user/profile', headers: { Authorization: 'Bearer {token}' }, accountPath: 'username' } },
  { service: 'Resend', category: 'Email & Marketing', icon: 'mail', blurb: 'Email sending and domains.', keyHint: 'API key (Resend → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.resend.com/domains', headers: { Authorization: 'Bearer {token}' } } },

  // Storage & Files
  { service: 'Dropbox', category: 'Storage & Files', icon: 'folder', blurb: 'Files and folders.', keyHint: 'Generated access token (Dropbox App Console → your app)', fields: TOKEN, verify: { type: 'api', method: 'POST', url: 'https://api.dropboxapi.com/2/users/get_current_account', headers: { Authorization: 'Bearer {token}' }, accountPath: 'name.display_name' } },
  { service: 'Box', category: 'Storage & Files', icon: 'box', blurb: 'Files and folders.', keyHint: 'Developer token (Box Dev Console — expires in 60 minutes)', fields: TOKEN, verify: { type: 'api', url: 'https://api.box.com/2.0/users/me', headers: { Authorization: 'Bearer {token}' }, accountPath: 'name' } },

  // AI
  { service: 'OpenAI', category: 'AI', icon: 'cpu', blurb: 'Models and usage.', keyHint: 'API key (OpenAI → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.openai.com/v1/models', headers: { Authorization: 'Bearer {token}' } } },
  { service: 'Anthropic', category: 'AI', icon: 'cpu', blurb: 'Models and usage.', keyHint: 'API key (Anthropic Console → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.anthropic.com/v1/models', headers: { 'x-api-key': '{token}', 'anthropic-version': '2023-06-01' } } },
  { service: 'OpenRouter', category: 'AI', icon: 'cpu', blurb: 'Models, keys, and usage.', keyHint: 'API key (OpenRouter → Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://openrouter.ai/api/v1/auth/key', headers: { Authorization: 'Bearer {token}' }, accountPath: 'data.label' } },
  { service: 'Gemini', category: 'AI', icon: 'cpu', blurb: 'Google AI models.', keyHint: 'API key (Google AI Studio → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://generativelanguage.googleapis.com/v1/models?key={token}' } },
  { service: 'Hugging Face', category: 'AI', icon: 'cpu', blurb: 'Models and datasets.', keyHint: 'Access token (Hugging Face → Settings → Access Tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://huggingface.co/api/whoami', headers: { Authorization: 'Bearer {token}' }, accountPath: 'name' } },
  { service: 'Replicate', category: 'AI', icon: 'cpu', blurb: 'Model predictions.', keyHint: 'API token (Replicate → Account → API tokens)', fields: TOKEN, verify: { type: 'api', url: 'https://api.replicate.com/v1/predictions?limit=1', headers: { Authorization: 'Token {token}' } } },

  // Social
  { service: 'Mastodon', category: 'Social', icon: 'at-sign', blurb: 'Posts on your own instance.', keyHint: 'Access token (your instance → Preferences → Development)', fields: [{ key: 'instance', label: 'Instance domain', placeholder: 'mastodon.social' }, { key: 'token', label: 'Access token', secure: true }], verify: { type: 'api', url: 'https://{instance}/api/v1/accounts/verify_credentials', headers: { Authorization: 'Bearer {token}' }, accountPath: 'username' } },
  { service: 'Bluesky', category: 'Social', icon: 'at-sign', blurb: 'Posts on Bluesky (bsky.social accounts).', keyHint: 'App password (Bluesky → Settings → App Passwords) — never your main password', fields: [{ key: 'handle', label: 'Handle', placeholder: 'you.bsky.social' }, { key: 'password', label: 'App password', secure: true }], verify: { type: 'session', url: 'https://bsky.social/xrpc/com.atproto.server.createSession', body: '{"identifier":"{handle}","password":"{password}"}', accountPath: 'handle' } },

  // Data & Tools
  { service: 'Figma', category: 'Data & Tools', icon: 'figma', blurb: 'Files and projects.', keyHint: 'Personal access token (Figma → Settings → Security)', fields: TOKEN, verify: { type: 'api', url: 'https://api.figma.com/v1/me', headers: { 'X-Figma-Token': '{token}' }, accountPath: 'handle' } },
  { service: 'Miro', category: 'Data & Tools', icon: 'image', blurb: 'Boards and items.', keyHint: 'Access token (Miro → Profile → API)', fields: TOKEN, verify: { type: 'api', url: 'https://api.miro.com/v2/boards?limit=1', headers: { Authorization: 'Bearer {token}' } } },
  { service: 'Twilio', category: 'Data & Tools', icon: 'phone', blurb: 'SMS, calls, and numbers.', keyHint: 'Account SID + Auth Token (Twilio Console)', fields: [{ key: 'sid', label: 'Account SID' }, { key: 'token', label: 'Auth Token', secure: true }], verify: { type: 'api', url: 'https://api.twilio.com/2010-04-01/Accounts/{sid}.json', basic: ['sid', 'token'], accountPath: 'friendly_name' } },
  { service: 'Zoom', category: 'Data & Tools', icon: 'video', blurb: 'Meetings and users (server-to-server app).', keyHint: 'Account ID + Client ID + Secret (Zoom Marketplace → Server-to-Server OAuth app)', fields: [{ key: 'accountId', label: 'Account ID' }, { key: 'clientId', label: 'Client ID' }, { key: 'secret', label: 'Client Secret', secure: true }], verify: { type: 'token-exchange', tokenUrl: 'https://zoom.us/oauth/token?grant_type=account_credentials&account_id={accountId}', tokenBody: '', basic: ['clientId', 'secret'], meUrl: 'https://api.zoom.us/v2/users/me', accountPath: 'email' } },
  { service: 'OpenWeather', category: 'Data & Tools', icon: 'sun', blurb: 'Current weather and forecasts.', keyHint: 'API key (OpenWeather → API Keys)', fields: TOKEN, verify: { type: 'api', url: 'https://api.openweathermap.org/data/2.5/weather?q=London&appid={token}' } },
  { service: 'NewsAPI', category: 'Data & Tools', icon: 'file-text', blurb: 'News headlines and articles.', keyHint: 'API key (NewsAPI → Account)', fields: TOKEN, verify: { type: 'api', url: 'https://newsapi.org/v2/top-headlines?country=us&apiKey={token}' } },
  { service: 'Unsplash', category: 'Data & Tools', icon: 'image', blurb: 'Photos.', keyHint: 'Access Key (Unsplash Developers → Your apps)', fields: TOKEN, verify: { type: 'api', url: 'https://api.unsplash.com/photos/random?client_id={token}' } },
];

export const CONNECTION_CATEGORIES: string[] = [
  'Code & Deploy',
  'Chat & Messages',
  'Work & Projects',
  'Payments & Stores',
  'Email & Marketing',
  'Storage & Files',
  'AI',
  'Social',
  'Data & Tools',
];

export function catalogFor(service: string): CatalogService | undefined {
  return CONNECTION_CATALOG.find((c) => c.service.toLowerCase() === service.toLowerCase());
}

// Services that need a login (OAuth) and therefore a server: NOT
// connectable in this phone-local version, and never faked as a key
// field. They are listed in Connections under "Coming soon" (user
// order 2026-10-29) and arrive with the server phase, when payment
// starts. Tapping one explains that, instead of opening a form.
export type ComingSoonService = {
  service: string;
  icon: React.ComponentProps<typeof Feather>['name'];
  blurb: string;
};

export const COMING_SOON_SERVICES: ComingSoonService[] = [
  { service: 'Gmail', icon: 'mail', blurb: 'Mail, search, and labels.' },
  { service: 'Instagram', icon: 'camera', blurb: 'Posts, stories, and messages.' },
  { service: 'Facebook', icon: 'facebook', blurb: 'Pages, posts, and messages.' },
  { service: 'LinkedIn', icon: 'linkedin', blurb: 'Profile, posts, and messages.' },
  { service: 'YouTube', icon: 'youtube', blurb: 'Channel, videos, and comments.' },
  { service: 'X', icon: 'twitter', blurb: 'Posts and messages.' },
];
