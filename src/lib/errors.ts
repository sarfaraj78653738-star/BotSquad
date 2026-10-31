// User-facing failures (user order 2026-10-31): a failed reply shows
// a short plain-English sentence — what happened + what to do —
// never a bare number. The ProviderError message already carries
// that text (see src/lib/providers.ts, incl. the repeated-error
// ladder); this file only handles LEGACY history rows saved before
// the plain-English change, so old chats are not deleted.

// Legacy raw error text stored in an old chat (for example a reply saved
// as a raw client-error string with a numeric prefix).
export function isRawErrorText(text: string): boolean {
  const t = text.trim();
  return /client side error/i.test(t) || /^\d+\s*\/\s*client/i.test(t);
}

// Plain text for a legacy raw error row. A leading 3-digit code, when
// present, maps to the same short message; otherwise a generic line.
export function legacyPlainMessage(text: string): string {
  const m = text.trim().match(/^(\d{3})/);
  const code = m ? Number(m[1]) : 0;
  if (code === 401 || code === 403) return 'Your API key was rejected. Check the key in Settings and try again.';
  if (code === 429) return 'Rate limited. Wait a bit and try again.';
  if (code === 503) return 'Provider is busy. Try again in a few minutes.';
  if (code === 504) return 'Provider took too long. Try again.';
  return 'Provider error. Try again shortly.';
}
