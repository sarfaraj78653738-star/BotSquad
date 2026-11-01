// Premium (Remove Ads) — Razorpay MONTHLY subscription, webhook-
// verified only (user order 2026-10-31: ₹199/month, INR, UPI + card).
// Premium is ACTIVE ONLY WHILE the subscription is active: the
// Worker grants on subscription.activated/charged and revokes on
// subscription.cancelled/halted/paused/completed. A one-time payment
// model was replaced by this subscription model on 2026-10-31; the
// old order + payment.captured + refund-revoke code is gone —
// subscription status is now the SOLE source of truth (a refund of
// one month's charge does not revoke an active subscription; the
// next charge still comes, and cancel/halt revokes).
//
// SECURITY SHAPE (do not weaken):
// • The app NEVER grants premium from a checkout callback, a client
//   success screen, or a stored flag alone. The only grant source is
//   the Cloudflare Worker (server/razorpay-worker/), which sets a grant
//   only after verifying the Razorpay webhook signature with the
//   webhook secret (the secret never leaves the Worker).
// • The app NEVER creates a Razorpay subscription itself: creation
//   needs the key secret, so it lives in the Worker too. The app only
//   passes its Google user id; the Worker uses the dashboard Plan
//   (₹199/month, INR — create it in the Razorpay dashboard, store its
//   id as the Worker's RAZORPAY_PLAN_ID env).
// • Every Worker call carries the stored Google ID token as a Bearer
//   token (fix 2026-11-01 — the Worker previously took no auth, so
//   any caller could pass any userId). The Worker verifies the token
//   (RS256/JWKS, issuer, audience, expiry, sub match) and rate-limits
//   per userId before acting; a call without a token fails closed.
// • Double-subscription guards, three layers:
//   1. Buy is blocked when a subscription is already active.
//   2. An unauthorised subscription is reused (pending subscription
//      id in settings) instead of creating a second one on retry.
//   3. The Worker grants only on a verified subscription.activated /
//      charged webhook for a subscription it created.
// FILL THESE IN when Razorpay + the Worker are ready. Until then the
// buy button honestly reports that payments are being set up, and
// premium can never be granted — there is no client-side grant path.
import { getSetting, setSetting } from './db';
import { getGoogleIdToken, getGoogleUser } from './googleAuth';

// Display price. In paise for INR (the dashboard Plan, not this
// number, fixes the actual charge).
export const PREMIUM_PRICE_LABEL = '₹199';
export const PREMIUM_PRICE_CENTS = 19900;
export const PREMIUM_CURRENCY = 'INR';
export const RAZORPAY_KEY_ID = 'rzp_test_TurNOsdhClFFL5';
export const PREMIUM_WORKER_URL = 'https://botsquad-razorpay.botsquad-app.workers.dev';

const PREMIUM_KEY = 'premium_ads_removed';
const PENDING_SUBSCRIPTION_KEY = 'premium_pending_subscription';

// Authorization for Worker calls: the stored Google ID token as a
// Bearer token. The Worker verifies it (RS256/JWKS, issuer, audience,
// expiry, sub match) before acting. Returns null when no token is
// stored — callers fail closed (unknown/null/error) rather than
// sending an unauthenticated request the Worker would reject anyway.
async function authHeader(): Promise<Record<string, string> | null> {
  const token = await getGoogleIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : null;
}

export async function isPremium(): Promise<boolean> {
  try {
    return (await getSetting(PREMIUM_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setPremium(v: boolean): Promise<void> {
  await setSetting(PREMIUM_KEY, v ? '1' : '0');
}

async function getPendingSubscription(): Promise<string | null> {
  try {
    const v = await getSetting(PENDING_SUBSCRIPTION_KEY);
    return v ? v : null;
  } catch {
    return null;
  }
}

export async function setPendingSubscription(id: string | null): Promise<void> {
  await setSetting(PENDING_SUBSCRIPTION_KEY, id ?? '');
}

export type SubscriptionInfo = {
  subscriptionId: string;
  keyId: string;
  amount: number;
  currency: string;
  alreadyGranted: boolean;
};

// Grant status against the Worker. 'unknown' covers every case where
// the Worker cannot positively answer (not configured, not signed in,
// network failure, Worker error) — callers must NEVER treat 'unknown'
// as 'not granted', or an offline user would lose premium.
export type GrantStatus = 'granted' | 'not-granted' | 'unknown';
export async function checkGrantStatus(): Promise<GrantStatus> {
  if (!PREMIUM_WORKER_URL) return 'unknown';
  const user = await getGoogleUser().catch(() => null);
  if (!user) return 'unknown';
  const headers = await authHeader();
  if (!headers) return 'unknown';
  try {
    const res = await fetch(`${PREMIUM_WORKER_URL}/grant?userId=${encodeURIComponent(user.sub)}`, { headers });
    if (!res.ok) return 'unknown';
    const json = (await res.json().catch(() => null)) as { granted?: boolean } | null;
    return json?.granted === true ? 'granted' : 'not-granted';
  } catch {
    return 'unknown';
  }
}

// Grant check against the Worker. Returns false when the Worker is not
// configured, the user is not signed in, or the network fails — never
// throws, so callers can safely re-check on every visit.
export async function checkGrant(): Promise<boolean> {
  return (await checkGrantStatus()) === 'granted';
}

// Syncs the local premium flag BOTH ways from the Worker (the source
// of truth): granted → on, positively not-granted → off (subscription
// cancelled / halted revoke), unknown → leave unchanged (never revoke
// on a network failure or Worker error).
export async function syncPremiumFromGrant(): Promise<boolean> {
  const status = await checkGrantStatus();
  if (status === 'granted') await setPremium(true);
  else if (status === 'not-granted') await setPremium(false);
  return status === 'granted';
}

// Returns a pending subscription for reuse when one exists (retry =
// same subscription, no second subscription), otherwise creates a
// fresh subscription via the Worker. Throws when payments are not
// configured. amount/currency here are DISPLAY ONLY — the dashboard
// Plan fixes the actual charge (₹199/month, INR); Checkout takes the
// subscription id, not an amount.
export async function createSubscription(): Promise<SubscriptionInfo> {
  if (!PREMIUM_WORKER_URL || !RAZORPAY_KEY_ID) {
    throw new Error('Payments are being set up. Try again later.');
  }
  const user = await getGoogleUser().catch(() => null);
  if (!user) throw new Error('Sign in first.');
  const headers = await authHeader();
  if (!headers) throw new Error('Sign in again.');
  const pending = await getPendingSubscription();
  if (pending) {
    return { subscriptionId: pending, keyId: RAZORPAY_KEY_ID, amount: PREMIUM_PRICE_CENTS, currency: PREMIUM_CURRENCY, alreadyGranted: false };
  }
  const res = await fetch(`${PREMIUM_WORKER_URL}/create-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ userId: user.sub }),
  });
  if (!res.ok) throw new Error('Could not start the subscription. Try again.');
  const json = (await res.json().catch(() => null)) as { alreadyGranted?: boolean; subscriptionId?: string; keyId?: string; amount?: number; currency?: string } | null;
  if (json?.alreadyGranted) return { subscriptionId: '', keyId: '', amount: 0, currency: '', alreadyGranted: true };
  if (!json?.subscriptionId) throw new Error('Could not start the subscription. Try again.');
  await setPendingSubscription(json.subscriptionId);
  return { subscriptionId: json.subscriptionId, keyId: json.keyId ?? RAZORPAY_KEY_ID, amount: json.amount ?? PREMIUM_PRICE_CENTS, currency: json.currency ?? PREMIUM_CURRENCY, alreadyGranted: false };
}

// Live Plan price (price-change safeguard): the buy screen shows the
// dashboard Plan's current price, never a stale hardcoded label.
// Returns null on any failure — callers fall back to PREMIUM_PRICE_LABEL.
export async function getPlanPrice(): Promise<{ label: string; cents: number; currency: string } | null> {
  if (!PREMIUM_WORKER_URL) return null;
  const user = await getGoogleUser().catch(() => null);
  if (!user) return null;
  const headers = await authHeader();
  if (!headers) return null;
  try {
    const res = await fetch(`${PREMIUM_WORKER_URL}/plan`, { headers });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { amount?: number; currency?: string } | null;
    if (typeof json?.amount !== 'number' || !json.currency) return null;
    const label = json.currency === 'INR'
      ? `₹${json.amount % 100 === 0 ? json.amount / 100 : (json.amount / 100).toFixed(2)}`
      : `${json.currency} ${json.amount / 100}`;
    return { label, cents: json.amount, currency: json.currency };
  } catch {
    return null;
  }
}

// Renewal date for the payments screen (premium users). Returns null
// when unknown — callers hide the date rather than show a wrong one.
export async function getSubscriptionStatus(): Promise<{ status: string; renewsOn: string | null } | null> {
  if (!PREMIUM_WORKER_URL) return null;
  const user = await getGoogleUser().catch(() => null);
  if (!user) return null;
  const headers = await authHeader();
  if (!headers) return null;
  try {
    const res = await fetch(`${PREMIUM_WORKER_URL}/subscription-status?userId=${encodeURIComponent(user.sub)}`, { headers });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => null)) as { status?: string; currentEnd?: number | null; chargeAt?: number | null; unknown?: boolean } | null;
    if (!json || json.unknown || !json.status) return null;
    const ts = json.currentEnd ?? json.chargeAt;
    const renewsOn = typeof ts === 'number' ? new Date(ts * 1000).toISOString() : null;
    return { status: json.status, renewsOn };
  } catch {
    return null;
  }
}

// Cancels the active subscription IMMEDIATELY (cancel_at_cycle_end=0,
// user choice 2026-10-31): the subscription.cancelled webhook revokes
// premium at once. No refund for the remaining days.
export async function cancelSubscription(): Promise<void> {
  if (!PREMIUM_WORKER_URL) {
    throw new Error('Payments are being set up. Try again later.');
  }
  const user = await getGoogleUser().catch(() => null);
  if (!user) throw new Error('Sign in first.');
  const headers = await authHeader();
  if (!headers) throw new Error('Sign in again.');
  const res = await fetch(`${PREMIUM_WORKER_URL}/cancel-subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ userId: user.sub }),
  });
  if (!res.ok) throw new Error('Could not cancel the subscription. Try again.');
  const json = (await res.json().catch(() => null)) as { nothingToCancel?: boolean } | null;
  if (json?.nothingToCancel) throw new Error('No active subscription found for this account.');
}

// Re-verifies the TRUE subscription status with Razorpay via the
// Worker (not just the Worker's stored grant). Used by Restore: a
// paying user whose webhook was lost still gets premium back.
// Returns the synced local premium flag. On any failure or an
// 'unknown' answer, falls back to the stored-grant sync (never
// revokes on uncertainty).
export async function reconcileGrant(): Promise<boolean> {
  if (!PREMIUM_WORKER_URL) return syncPremiumFromGrant();
  const user = await getGoogleUser().catch(() => null);
  if (!user) return syncPremiumFromGrant();
  const headers = await authHeader();
  if (!headers) return syncPremiumFromGrant();
  try {
    const pending = await getPendingSubscription();
    const res = await fetch(`${PREMIUM_WORKER_URL}/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ userId: user.sub, pendingSubscriptionId: pending }),
    });
    if (!res.ok) return syncPremiumFromGrant();
    const json = (await res.json().catch(() => null)) as { granted?: boolean; unknown?: boolean } | null;
    if (!json || json.unknown) return syncPremiumFromGrant();
    if (json.granted === true) await setPremium(true);
    else await setPremium(false);
    return json.granted === true;
  } catch {
    return syncPremiumFromGrant();
  }
}

// Polls the Worker grant (webhook arrival can lag the checkout success
// screen by seconds). Returns true only on a verified grant.
export async function pollGrant(timeoutMs = 60000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await checkGrant()) return true;
    await new Promise((r) => setTimeout(r, 3000));
  }
  return false;
}
