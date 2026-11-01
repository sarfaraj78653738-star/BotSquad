// BotSquad Razorpay Worker (Cloudflare Workers, no dependencies).
// This is the ONLY place that may touch Razorpay secrets. Env vars
// (set with `wrangler secret put`, never in code or in the app):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
//   RAZORPAY_PLAN_ID (the dashboard Plan id — see below).
// KV binding: GRANTS (see wrangler.toml).
//
// CALLER AUTH (fix 2026-11-01 — endpoints previously took no auth at
// all, so any caller could pass any userId): the app sends its stored
// Google ID token as `Authorization: Bearer <idToken>` on every
// user-scoped call. The Worker verifies it before acting — RS256
// signature against Google's JWKS, issuer, audience (the Web
// OAuth client id, a PUBLIC identifier), expiry, and token
// sub === requested userId — and rate-limits per userId + endpoint.
// The webhook path is unchanged (HMAC only, no Bearer token).
// NOTE: sign-in requests an ID token via webClientId (Web OAuth
// client, 2026-11-01); the user must sign in again after updating so
// a token with the new audience is stored. The app fails closed
// (no token = no Worker call).
//
// MONTHLY SUBSCRIPTION (user order 2026-10-31, replaces the old
// one-time $5 model): ₹199/month, INR. The price lives in the
// Razorpay dashboard Plan, NOT here — create a Plan (₹199, monthly,
// INR) in the dashboard and store its id as RAZORPAY_PLAN_ID. The app
// never sends an amount: a client that could set its own price could
// pay ₹1 for premium. A subscription's billing cycles (total_count)
// is 1200 (Razorpay's documented example for a 30-year monthly plan),
// i.e. effectively until the user cancels.
//
// Endpoints:
//   POST /create-subscription { userId } -> { subscriptionId, keyId }
//     or { alreadyGranted: true } when the user already has an active
//     subscription.
//   POST /cancel-subscription { userId } -> { ok: true } (cancels
//     IMMEDIATELY — user choice 2026-10-31; the cancelled webhook
//     then revokes the grant) or { nothingToCancel: true }.
//   POST /reconcile { userId, pendingSubscriptionId? } -> { granted }
//     or { unknown: true }. Re-verifies true status with Razorpay
//     (Restore path; covers a lost activated webhook via the pending
//     id). Unknown never revokes; a grant is removed only when every
//     checked subscription is positively non-active.
//   POST /webhook — Razorpay calls this. The signature is verified with
//     the webhook secret before anything is trusted. Subscription
//     status is the SOLE source of truth: activated/charged grant,
//     cancelled/halted/paused/completed revoke. A payment.failed alone
//     never revokes (Razorpay retries; halted revokes if it gives up).
//     LOOPHOLE CLOSE (2026-10-31): a refund (refund.processed) or a
//     lost chargeback (payment.dispute.lost) cancels that subscription
//     IMMEDIATELY and revokes premium, unless another active
//     subscription still covers the user (duplicate guard, via the
//     subs:<userId> list). Otherwise pay → refund → cancel before
//     renewal would yield a free month. The payment → subscription
//     mapping goes payment → invoice → subscription via the Razorpay
//     API, defensively (any lookup failure revokes nothing).
//   GET  /grant?userId=... -> { granted: true|false }
//
// Double-subscription guards: the app reuses a pending subscription
// id, and this Worker grants only for subscriptions it created
// (pending/sub mapping + notes.userId).

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

// --- Google ID-token verification (Web Crypto, no dependencies) ---
// Values verified against Google's official verification docs +
// a working Web Crypto reference implementation (2026-11-01):
// JWKS (JWK format) at oauth2/v3/certs; issuers exactly
// 'accounts.google.com' or 'https://accounts.google.com'; audience
// exact-matches our client id; exp must be in the future; algorithm
// pinned to RS256 (never taken from the token header); key selected
// by header kid, with one JWKS refetch on an unknown kid (rotation).
const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const GOOGLE_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
const GOOGLE_AUDIENCE = '882528237595-nv1i273dj68v1mr8itbgij2r59fb97mv.apps.googleusercontent.com';

function base64urlDecode(s) {
  let t = s.replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let jwksCache = null; // { keys, at, maxAge }
async function fetchJwks() {
  try {
    const res = await fetch(GOOGLE_JWKS_URL);
    if (!res.ok) return null;
    const cc = res.headers.get('Cache-Control') || '';
    const m = cc.match(/max-age=(\d+)/);
    // Honour Cache-Control when present; the fallback is a local
    // default, NOT a Google-documented TTL (Google documents none).
    const maxAge = m ? parseInt(m[1], 10) * 1000 : 3600 * 1000;
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.keys)) return null;
    jwksCache = { keys: data.keys, at: Date.now(), maxAge };
    return jwksCache;
  } catch {
    return null;
  }
}
async function getJwks() {
  if (jwksCache && Date.now() - jwksCache.at < jwksCache.maxAge) return jwksCache;
  return (await fetchJwks()) || jwksCache; // stale cache beats no cache
}

// Returns the token's sub on success, null on ANY failure (bad shape,
// wrong alg/kid, wrong iss/aud, expired, bad signature, JWKS down).
// Never throws, never leaks a reason — callers answer 401.
async function verifyGoogleIdToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const header = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[0])));
    const payload = JSON.parse(new TextDecoder().decode(base64urlDecode(parts[1])));
    if (header.alg !== 'RS256' || !header.kid) return null;
    if (!GOOGLE_ISSUERS.includes(payload.iss)) return null;
    if (payload.aud !== GOOGLE_AUDIENCE) return null;
    if (typeof payload.exp !== 'number' || payload.exp * 1000 <= Date.now()) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;
    let jwks = await getJwks();
    let jwk = jwks?.keys.find((k) => k.kid === header.kid);
    if (!jwk) {
      jwks = await fetchJwks(); // rotation: refetch once before rejecting
      jwk = jwks?.keys.find((k) => k.kid === header.kid);
      if (!jwk) return null;
    }
    const key = await crypto.subtle.importKey(
      'jwk',
      jwk,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const ok = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      key,
      base64urlDecode(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    return ok ? payload.sub : null;
  } catch {
    return null;
  }
}

// Returns the verified token sub, or null. When expectedUserId is
// given, the token must belong to that user — no cross-user calls.
async function authedSub(request, expectedUserId) {
  const auth = request.headers.get('Authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/);
  if (!m) return null;
  const sub = await verifyGoogleIdToken(m[1]);
  if (!sub) return null;
  if (expectedUserId !== undefined && sub !== expectedUserId) return null;
  return sub;
}

// Per-userId, per-endpoint fixed-window rate limit (in-memory,
// per-isolate). Auth already kills anonymous spam; this bounds
// authenticated abuse. Strict global limiting would need Durable
// Objects — noted, not built (pre-launch scale).
const rateBuckets = new Map();
function rateOk(callerSub, endpoint) {
  const now = Date.now();
  for (const [k, v] of rateBuckets) if (now - v.start > 60000) rateBuckets.delete(k);
  const key = `${sub}:${endpoint}`;
  const b = rateBuckets.get(key) || { start: now, count: 0 };
  if (now - b.start > 60000) { b.start = now; b.count = 0; }
  b.count += 1;
  rateBuckets.set(key, b);
  return b.count <= 30;
}

// Plan fetch with a Worker-side cache (Plans are immutable, so a
// cached Plan is still correct). On fetch failure the cached Plan
// (even stale) is used, so one Razorpay blip does not 502 every buy;
// null only when no Plan was ever fetched successfully.
let planCache = null; // { at, plan }
async function getPlanCached(env) {
  const now = Date.now();
  if (planCache && now - planCache.at < 5 * 60 * 1000) return planCache.plan;
  try {
    const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
    const planRes = await fetch(`https://api.razorpay.com/v1/plans/${env.RAZORPAY_PLAN_ID}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!planRes.ok) return planCache ? planCache.plan : null;
    const plan = await planRes.json();
    planCache = { at: now, plan };
    return plan;
  } catch {
    return planCache ? planCache.plan : null;
  }
}

// Constant-time HMAC-SHA256 comparison (Web Crypto has no
// timingSafeEqual; a plain === leaks timing on the signature).
async function signatureOk(secret, body, signature) {
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    const hex = [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex.length !== signature.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.charCodeAt(i);
    return diff === 0;
  } catch {
    return false;
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname === '/grant' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return json({ granted: false }, 400);
      const callerSub = await authedSub(request, userId);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'grant')) return json({ error: 'rate limited' }, 429);
      const grant = await env.GRANTS.get(`grant:${userId}`);
      return json({ granted: !!grant });
    }

    if (url.pathname === '/create-subscription' && request.method === 'POST') {
      const { userId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      const callerSub = await authedSub(request, userId);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'create-subscription')) return json({ error: 'rate limited' }, 429);
      if (!env.RAZORPAY_PLAN_ID) return json({ error: 'plan not configured' }, 500);
      const existing = await env.GRANTS.get(`grant:${userId}`);
      if (existing) return json({ alreadyGranted: true });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      // Fail closed on the Plan: a mis-typed dashboard Plan must never
      // overcharge a user. Verify amount + currency strictly, and
      // period/interval when the Plan reports them. (Retrieved Plans
      // nest amount/currency under item; fall back to top level.)
      const plan = await getPlanCached(env);
      if (!plan) return json({ error: 'plan check failed' }, 502);
      const planAmount = plan?.item?.amount ?? plan?.amount;
      const planCurrency = plan?.item?.currency ?? plan?.currency;
      if (planAmount !== 19900 || planCurrency !== 'INR') return json({ error: 'plan mismatch' }, 500);
      if (plan?.period && plan.period !== 'monthly') return json({ error: 'plan mismatch' }, 500);
      if (plan?.interval && plan.interval !== 1) return json({ error: 'plan mismatch' }, 500);
      const res = await fetch('https://api.razorpay.com/v1/subscriptions', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan_id: env.RAZORPAY_PLAN_ID,
          total_count: 1200,
          quantity: 1,
          customer_notify: 1,
          notes: { userId },
        }),
      });
      if (!res.ok) {
        // Test-phase transparency (2026-11-01): return Razorpay's own
        // reason so a failed subscribe names its cause instead of
        // hiding behind one generic line. The app shows the detail
        // after the generic prefix; tighten before launch if needed.
        const err = await res.json().catch(() => null);
        const detail = err?.error?.description || err?.error?.code || `Razorpay ${res.status}`;
        return json({ error: 'subscription failed', detail }, 502);
      }
      const sub = await res.json();
      await env.GRANTS.put(`pending:${sub.id}`, userId);
      return json({ subscriptionId: sub.id, keyId: env.RAZORPAY_KEY_ID, amount: planAmount, currency: planCurrency });
    }

    if (url.pathname === '/cancel-subscription' && request.method === 'POST') {
      const { userId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      const callerSub = await authedSub(request, userId);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'cancel-subscription')) return json({ error: 'rate limited' }, 429);
      const grantRaw = await env.GRANTS.get(`grant:${userId}`);
      if (!grantRaw) return json({ nothingToCancel: true });
      let subscriptionId = null;
      try { subscriptionId = JSON.parse(grantRaw).subscription_id || null; } catch { subscriptionId = null; }
      if (!subscriptionId) return json({ nothingToCancel: true });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_at_cycle_end: 0 }),
      });
      if (!res.ok) return json({ error: 'cancel failed' }, 502);
      return json({ ok: true });
    }

    if (url.pathname === '/reconcile' && request.method === 'POST') {
      // Re-verifies the TRUE subscription status with Razorpay (used
      // by the app's Restore). Covers a lost activated webhook: the
      // app passes its pending (unauthorised) subscription id too.
      // Safe defaults throughout: a status we cannot verify never
      // revokes a grant (unknown), and a grant is removed only when
      // every checked subscription is positively non-active.
      const { userId, pendingSubscriptionId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      const callerSub = await authedSub(request, userId);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'reconcile')) return json({ error: 'rate limited' }, 429);
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const candidates = [];
      const grantRaw = await env.GRANTS.get(`grant:${userId}`);
      if (grantRaw) {
        try { const g = JSON.parse(grantRaw); if (g.subscription_id) candidates.push(g.subscription_id); } catch {}
      }
      try {
        const raw = await env.GRANTS.get(`subs:${userId}`);
        const list = raw ? JSON.parse(raw) : [];
        for (const id of list) if (!candidates.includes(id)) candidates.push(id);
      } catch {}
      // A caller-supplied pending id counts ONLY if the KV mapping
      // proves it belongs to this user — otherwise anyone could grant
      // themselves premium from someone else's paid subscription id.
      if (pendingSubscriptionId && !candidates.includes(pendingSubscriptionId)) {
        const owner = (await env.GRANTS.get(`pending:${pendingSubscriptionId}`)) || (await env.GRANTS.get(`sub:${pendingSubscriptionId}`));
        if (owner === userId) candidates.push(pendingSubscriptionId);
      }
      if (candidates.length === 0) {
        return json(grantRaw ? { unknown: true } : { granted: false });
      }
      let anyActive = false;
      let anyChecked = false;
      const stillActive = [];
      for (const subId of candidates) {
        const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });
        if (!res.ok) continue;
        anyChecked = true;
        const sub = await res.json();
        if (sub?.status === 'active') {
          anyActive = true;
          stillActive.push(subId);
        }
      }
      if (!anyChecked) return json({ unknown: true });
      if (anyActive) {
        await env.GRANTS.put(
          `grant:${userId}`,
          JSON.stringify({ subscription_id: stillActive[0], status: 'active', at: new Date().toISOString() }),
        );
        await env.GRANTS.put(`subs:${userId}`, JSON.stringify(stillActive));
        return json({ granted: true });
      }
      await env.GRANTS.delete(`grant:${userId}`);
      await env.GRANTS.put(`subs:${userId}`, JSON.stringify([]));
      return json({ granted: false });
    }

    // Public price lookup (price-change safeguard): the app shows the
    // live Plan price instead of a hardcoded label, so a dashboard
    // price change can never leave a stale price on the buy screen.
    // Fail closed (502) — the app falls back to its hardcoded label.
    if (url.pathname === '/plan' && request.method === 'GET') {
      const callerSub = await authedSub(request);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'plan')) return json({ error: 'rate limited' }, 429);
      if (!env.RAZORPAY_PLAN_ID) return json({ error: 'plan not configured' }, 500);
      const plan = await getPlanCached(env);
      if (!plan) return json({ error: 'plan check failed' }, 502);
      const amount = plan?.item?.amount ?? plan?.amount;
      const currency = plan?.item?.currency ?? plan?.currency;
      if (typeof amount !== 'number' || !currency) return json({ error: 'plan mismatch' }, 500);
      return json({ amount, currency, period: plan?.period ?? null, interval: plan?.interval ?? null });
    }

    // Renewal reminder: returns the active subscription's next renewal
    // (current_end) for the app's payments screen. Unknown on any
    // failure — the app hides the date rather than showing a wrong one.
    if (url.pathname === '/subscription-status' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return json({ error: 'userId required' }, 400);
      const callerSub = await authedSub(request, userId);
      if (!sub) return json({ error: 'unauthorized' }, 401);
      if (!rateOk(callerSub, 'subscription-status')) return json({ error: 'rate limited' }, 429);
      const grantRaw = await env.GRANTS.get(`grant:${userId}`);
      let subscriptionId = null;
      try { subscriptionId = grantRaw ? JSON.parse(grantRaw).subscription_id || null : null; } catch { subscriptionId = null; }
      if (!subscriptionId) {
        try {
          const raw = await env.GRANTS.get(`subs:${userId}`);
          const list = raw ? JSON.parse(raw) : [];
          if (list.length > 0) subscriptionId = list[0];
        } catch {}
      }
      if (!subscriptionId) return json({ status: 'none' });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) return json({ unknown: true }, 502);
      const sub = await res.json();
      return json({ status: sub?.status ?? 'unknown', currentEnd: sub?.current_end ?? null, chargeAt: sub?.charge_at ?? null });
    }

    if (url.pathname === '/webhook' && request.method === 'POST') {
      const body = await request.text();
      const signature = request.headers.get('x-razorpay-signature') || '';
      if (!(await signatureOk(env.RAZORPAY_WEBHOOK_SECRET, body, signature))) {
        return new Response('bad signature', { status: 400 });
      }
      let event;
      try {
        event = JSON.parse(body);
      } catch {
        return new Response('bad json', { status: 400 });
      }
      // Subscription lifecycle is the SOLE source of truth. The
      // subscription id maps to a user via notes.userId (set at
      // creation) or via the pending/sub KV mappings.
      if (event.event === 'subscription.activated' || event.event === 'subscription.charged') {
        const sub = event.payload?.subscription?.entity;
        const subId = sub?.id;
        if (subId) {
          const userId = sub?.notes?.userId
            || (await env.GRANTS.get(`pending:${subId}`))
            || (await env.GRANTS.get(`sub:${subId}`));
          if (userId) {
            await env.GRANTS.put(
              `grant:${userId}`,
              JSON.stringify({ subscription_id: subId, status: sub?.status || event.event, at: new Date().toISOString() }),
            );
            await env.GRANTS.put(`sub:${subId}`, userId);
            await env.GRANTS.delete(`pending:${subId}`);
            // Track every active subscription per user (duplicate
            // guard: a refund for one sub must not kill premium
            // covered by another).
            try {
              const raw = await env.GRANTS.get(`subs:${userId}`);
              const list = raw ? JSON.parse(raw) : [];
              if (!list.includes(subId)) list.push(subId);
              await env.GRANTS.put(`subs:${userId}`, JSON.stringify(list));
            } catch { /* list is best-effort; the grant above rules */ }
          }
        }
      }
      if (event.event === 'subscription.cancelled' || event.event === 'subscription.halted'
        || event.event === 'subscription.paused' || event.event === 'subscription.completed') {
        const sub = event.payload?.subscription?.entity;
        const subId = sub?.id;
        if (subId) {
          const userId = sub?.notes?.userId
            || (await env.GRANTS.get(`sub:${subId}`))
            || (await env.GRANTS.get(`pending:${subId}`));
          if (userId) {
            await env.GRANTS.delete(`sub:${subId}`);
            await env.GRANTS.delete(`pending:${subId}`);
            // Revoke only when NO other active subscription covers the
            // user (duplicate guard); otherwise re-point the grant.
            // On a list read failure, leave the grant alone — never
            // punish the user for our own error.
            let remaining = null;
            try {
              const raw = await env.GRANTS.get(`subs:${userId}`);
              remaining = (raw ? JSON.parse(raw) : []).filter((id) => id !== subId);
              await env.GRANTS.put(`subs:${userId}`, JSON.stringify(remaining));
            } catch { remaining = null; }
            if (remaining !== null && remaining.length === 0) {
              await env.GRANTS.delete(`grant:${userId}`);
            } else if (remaining !== null && remaining.length > 0) {
              await env.GRANTS.put(
                `grant:${userId}`,
                JSON.stringify({ subscription_id: remaining[0], status: 'active', at: new Date().toISOString() }),
              );
            }
          }
        }
      }
      // LOOPHOLE CLOSE: pay → refund → cancel before renewal must not
      // yield a free month. A refund (merchant or chargeback-lost)
      // cancels that subscription IMMEDIATELY and revokes premium
      // unless another active subscription still covers the user.
      // Mapping is payment → invoice → subscription via the Razorpay
      // API; every step is defensive — any lookup failure or missing
      // field revokes nothing (the manual dashboard process covers it).
      // Dispute payload shape follows the standard pattern
      // (payload.dispute.entity); if it ever differs, paymentId is
      // undefined and nothing happens.
      if (event.event === 'refund.processed' || event.event === 'payment.dispute.lost') {
        const paymentId = event.event === 'refund.processed'
          ? event.payload?.refund?.entity?.payment_id
          : event.payload?.dispute?.entity?.payment_id;
        if (paymentId) {
          try {
            const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
            const payRes = await fetch(`https://api.razorpay.com/v1/payments/${paymentId}`, {
              headers: { Authorization: `Basic ${auth}` },
            });
            if (payRes.ok) {
              const payment = await payRes.json();
              let subId = payment?.subscription_id || null;
              if (!subId && payment?.invoice_id) {
                const invRes = await fetch(`https://api.razorpay.com/v1/invoices/${payment.invoice_id}`, {
                  headers: { Authorization: `Basic ${auth}` },
                });
                if (invRes.ok) {
                  const invoice = await invRes.json();
                  subId = invoice?.subscription_id || null;
                }
              }
              if (subId) {
                await fetch(`https://api.razorpay.com/v1/subscriptions/${subId}/cancel`, {
                  method: 'POST',
                  headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ cancel_at_cycle_end: 0 }),
                }).catch(() => {});
                const userId = await env.GRANTS.get(`sub:${subId}`);
                if (userId) {
                  await env.GRANTS.delete(`sub:${subId}`);
                  await env.GRANTS.delete(`pending:${subId}`);
                  let remaining = null;
                  try {
                    const raw = await env.GRANTS.get(`subs:${userId}`);
                    remaining = (raw ? JSON.parse(raw) : []).filter((id) => id !== subId);
                    await env.GRANTS.put(`subs:${userId}`, JSON.stringify(remaining));
                  } catch { remaining = null; }
                  if (remaining !== null && remaining.length === 0) {
                    await env.GRANTS.delete(`grant:${userId}`);
                  } else if (remaining !== null && remaining.length > 0) {
                    await env.GRANTS.put(
                      `grant:${userId}`,
                      JSON.stringify({ subscription_id: remaining[0], status: 'active', at: new Date().toISOString() }),
                    );
                  }
                }
              }
            }
          } catch { /* defensive: never revoke on a lookup failure */ }
        }
      }
      // payment.failed: deliberately ignored — Razorpay retries the
      // charge, and the subscription stays active until it is halted,
      // at which point subscription.halted revokes. A refund of one
      // month's charge is handled above (cancel + revoke), NOT ignored.
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },
};
