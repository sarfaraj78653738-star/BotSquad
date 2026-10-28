// User-facing failure codes: a failed reply is NEVER shown with a
// sentence, a raw error dump, or a numeric prefix like "5/". The user
// sees only a plain number ("Error 503") plus a Retry action. Internal
// detail (provider messages, HTTP bodies, stack text) never reaches UI.
import { ProviderError } from './providers';

function mapStatus(status: number): number {
  if (status === 401 || status === 403 || status === 404 || status === 429 || status === 402) return status;
  if (status === 500) return 500;
  if (status >= 500) return 503;
  return 503;
}

// Mapping table (failure -> number shown):
//   401  bad / unauthorised key (incl. no key set)
//   403  forbidden (provider rejected the request, page needs login)
//   404  not found (unknown model / endpoint path)
//   429  provider rate limit
//   402  provider billing / credit problem
//   500  provider server error (HTTP 500 exactly)
//   503  provider unavailable / network failure, and the fallback when
//        the exact code cannot be determined from the failure.
export function errorCode(e: unknown): number {
  if (e instanceof ProviderError) {
    if (typeof e.status === 'number') return mapStatus(e.status);
    switch (e.code) {
      case 'NO_KEY': return 401;
      case 'RATE_LIMIT': return 429;
      case 'LOGIN_REQUIRED': return 403;
      case 'BILLING': return 402;
      case 'NETWORK': return 503;
      default: return 503;
    }
  }
  return 503;
}

// Legacy raw error text stored in an old chat (for example a reply saved
// as a raw client-error string with a numeric prefix) must be hidden
// the same way: it renders as "Error 503" instead, without deleting
// the user's history.
export function isRawErrorText(text: string): boolean {
  const t = text.trim();
  return /client side error/i.test(t) || /^\d+\s*\/\s*client/i.test(t);
}
