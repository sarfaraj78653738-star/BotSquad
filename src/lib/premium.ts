// Premium (Remove Ads) — Razorpay, webhook-verified only (user orders
// 2026-10-31: $5 one time, Razorpay gateway, payment counts as
// successful ONLY when the Razorpay webhook confirms it, and a user
// who retries payment is still charged only once).
//
// SECURITY SHAPE (do not weaken):
// • The app NEVER grants premium from a checkout callback, a client
//   success screen, or a stored flag alone. The only grant source is
//   the Cloudflare Worker (server/razorpay-worker/), which sets a grant
//   only after verifying the Razorpay webhook signature with the
//   webhook secret (the secret never leaves the Worker).
// • The app NEVER creates a Razorpay order itself: order creation needs
//   the key secret, so it lives in the Worker too. The app only passes
//   its Google user id; the Worker fixes amount (500) and currency (USD).
// • One-charge idempotency, three layers:
//   1. Buy is blocked when premium is already active (no new order).
//   2. An unfinished order is reused (pending order id in settings)
//      instead of creating a second order on retry.
//   3. The Worker dedupes by Razorpay payment id: a repeated webhook
//      for the same payment grants once.
// FILL THESE IN when Razorpay + the Worker are ready. Until then the
// buy button honestly reports that payments are being set up, and
// premium can never be granted — there is no client-side grant path.
import { getSetting, setSetting } from './db';
import { getGoogleUser } from './googleAuth';

export const PREMIUM_PRICE_LABEL = '$5';
export const PREMIUM_PRICE_CENTS = 500;
export const PREMIUM_CURRENCY = 'USD';
export const RAZORPAY_KEY_ID = '';
export const PREMIUM_WORKER_URL = '';

const PREMIUM_KEY = 'premium_ads_removed';
const PENDING_ORDER_KEY = 'premium_pending_order';

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

async function getPendingOrder(): Promise<string | null> {
  try {
    const v = await getSetting(PENDING_ORDER_KEY);
    return v ? v : null;
  } catch {
    return null;
  }
}

export async function setPendingOrder(id: string | null): Promise<void> {
  await setSetting(PENDING_ORDER_KEY, id ?? '');
}

export type OrderInfo = {
  orderId: string;
  keyId: string;
  amount: number;
  currency: string;
  alreadyGranted: boolean;
};

// Grant check against the Worker. Returns false when the Worker is not
// configured, the user is not signed in, or the network fails — never
// throws, so callers can safely re-check on every visit.
export async function checkGrant(): Promise<boolean> {
  if (!PREMIUM_WORKER_URL) return false;
  const user = await getGoogleUser().catch(() => null);
  if (!user) return false;
  try {
    const res = await fetch(`${PREMIUM_WORKER_URL}/grant?userId=${encodeURIComponent(user.sub)}`);
    if (!res.ok) return false;
    const json = (await res.json().catch(() => null)) as { granted?: boolean } | null;
    return json?.granted === true;
  } catch {
    return false;
  }
}

export async function syncPremiumFromGrant(): Promise<boolean> {
  const granted = await checkGrant();
  if (granted) await setPremium(true);
  return granted;
}

// Returns a pending order for reuse when one exists (retry = same
// order, no second charge), otherwise creates a fresh order via the
// Worker. Throws when payments are not configured.
export async function createOrder(): Promise<OrderInfo> {
  if (!PREMIUM_WORKER_URL || !RAZORPAY_KEY_ID) {
    throw new Error('Payments are being set up. Try again later.');
  }
  const user = await getGoogleUser().catch(() => null);
  if (!user) throw new Error('Sign in first.');
  const pending = await getPendingOrder();
  if (pending) {
    return { orderId: pending, keyId: RAZORPAY_KEY_ID, amount: PREMIUM_PRICE_CENTS, currency: PREMIUM_CURRENCY, alreadyGranted: false };
  }
  const res = await fetch(`${PREMIUM_WORKER_URL}/create-order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: user.sub }),
  });
  if (!res.ok) throw new Error('Could not start the payment. Try again.');
  const json = (await res.json().catch(() => null)) as { alreadyGranted?: boolean; orderId?: string; keyId?: string; amount?: number; currency?: string } | null;
  if (json?.alreadyGranted) return { orderId: '', keyId: '', amount: 0, currency: '', alreadyGranted: true };
  if (!json?.orderId) throw new Error('Could not start the payment. Try again.');
  await setPendingOrder(json.orderId);
  return { orderId: json.orderId, keyId: json.keyId ?? RAZORPAY_KEY_ID, amount: json.amount ?? PREMIUM_PRICE_CENTS, currency: json.currency ?? PREMIUM_CURRENCY, alreadyGranted: false };
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
