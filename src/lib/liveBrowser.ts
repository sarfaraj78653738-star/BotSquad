// Live in-chat browser: pure helpers only, no UI, no secrets.
// The bot's action surface is a fixed allowlist. Anything that changes
// state on a site (tap, type) goes through user approval in the panel;
// passwords and login steps are never automated — they always hand
// control to the user.

export type BrowserAction =
  | { kind: 'navigate'; url: string }
  | { kind: 'back' }
  | { kind: 'forward' }
  | { kind: 'reload' }
  | { kind: 'scroll'; direction: 'up' | 'down' }
  | { kind: 'tap'; text: string }
  | { kind: 'type'; field: string; value: string };

export function normalizeBrowserUrl(input: string): string | null {
  const raw = input.trim().replace(/^[<[(]+/, '').replace(/[>).,;]+$/, '');
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(parsed.hostname)) return null;
  return withScheme;
}

// Short names the user commonly says. Nothing else is special-cased:
// any other domain the user names is used verbatim after normalization.
const KNOWN_SITES: Record<string, string> = {
  facebook: 'https://www.facebook.com',
  youtube: 'https://www.youtube.com',
  google: 'https://www.google.com',
  instagram: 'https://www.instagram.com',
  wikipedia: 'https://www.wikipedia.org',
  github: 'https://github.com',
  x: 'https://x.com',
  twitter: 'https://x.com',
};

export function parseBrowserRequest(text: string): { open: boolean; url?: string } {
  const lower = text.toLowerCase();
  const wantsBrowser = /open (the )?browser|browser (kholo|open)|in[ -]chat browser/.test(lower);
  const domain = text.match(/([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?/i)?.[0];
  if (domain) {
    const url = normalizeBrowserUrl(domain);
    if (url && (wantsBrowser || /open|go to|kholo|visit|browse/.test(lower))) return { open: true, url };
  }
  for (const [name, url] of Object.entries(KNOWN_SITES)) {
    if (new RegExp(`\\bopen\\b[^.]{0,40}\\b${name}\\b|\\b${name}\\b[^.]{0,20}\\b(kholo|open)\\b`, 'i').test(text)) {
      return { open: true, url };
    }
  }
  if (wantsBrowser) return { open: true };
  return { open: false };
}

// Assistant-side command format, documented in the system prompt:
// one [BROWSER ...] line per action. Unknown lines are ignored, never
// executed, and never treated as instructions for anything else.
export function parseBrowserCommands(reply: string): BrowserAction[] {
  const actions: BrowserAction[] = [];
  for (const line of reply.split('\n')) {
    const m = line.match(/\[BROWSER\s+([^\]]+)\]/i);
    if (!m) continue;
    const rest = m[1].trim();
    const nav = rest.match(/^navigate\s+(\S+)/i);
    if (nav) {
      const url = normalizeBrowserUrl(nav[1]);
      if (url) actions.push({ kind: 'navigate', url });
      continue;
    }
    if (/^back$/i.test(rest)) { actions.push({ kind: 'back' }); continue; }
    if (/^forward$/i.test(rest)) { actions.push({ kind: 'forward' }); continue; }
    if (/^reload$/i.test(rest)) { actions.push({ kind: 'reload' }); continue; }
    const scroll = rest.match(/^scroll\s+(up|down)$/i);
    if (scroll) { actions.push({ kind: 'scroll', direction: scroll[1].toLowerCase() as 'up' | 'down' }); continue; }
    const tap = rest.match(/^tap\s+"([^"]{1,100})"$/i);
    if (tap) { actions.push({ kind: 'tap', text: tap[1] }); continue; }
    const type = rest.match(/^type\s+"([^"]{1,100})"\s+"([^"]{1,500})"$/i);
    if (type) { actions.push({ kind: 'type', field: type[1], value: type[2] }); continue; }
    // Anything else in brackets is ignored: it is not an action.
  }
  return actions;
}

export function describeAction(a: BrowserAction): string {
  switch (a.kind) {
    case 'navigate': return `Opened ${new URL(a.url).hostname}`;
    case 'back': return 'Went back';
    case 'forward': return 'Went forward';
    case 'reload': return 'Reloaded the page';
    case 'scroll': return `Scrolled ${a.direction}`;
    case 'tap': return `Tapped "${a.text}"`;
    case 'type': return `Typed into "${a.field}"`;
  }
}

// A type action is sensitive (and therefore never automated) when the
// field looks like a credential field. This is checked before any
// approval card is even shown: sensitive fields go straight to handover.
export function isSensitiveField(field: string): boolean {
  return /pass|pwd|otp|pin|secret|credential/i.test(field);
}

export function isLoginOrCaptchaPage(url: string, title: string): boolean {
  const hay = `${url} ${title}`.toLowerCase();
  return /login|sign-in|signin|sign-up|signup|auth|captcha|checkpoint|verify/.test(hay);
}

// Escape a short user/model string for safe embedding inside a single-
// quoted JS string literal in injected code. Length-capped by callers.
export function jsString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ').slice(0, 500);
}
