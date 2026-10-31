// BotSquad Razorpay Worker (Cloudflare Workers, no dependencies).
// This is the ONLY place that may touch Razorpay secrets. Env vars
// (set with `wrangler secret put`, never in code or in the app):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET,
//   RAZORPAY_PLAN_ID (the dashboard Plan id — see below).
// KV binding: GRANTS (see wrangler.toml).
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
//   POST /cancel-subscription { userId } -> { ok: true } (cancels AT
//     the end of the current billing period; the grant stays until the
//     subscription.cancelled webhook fires) or { nothingToCancel: true }.
//   POST /webhook — Razorpay calls this. The signature is verified with
//     the webhook secret before anything is trusted. Subscription
//     status is the SOLE source of truth: activated/charged grant,
//     cancelled/halted/paused/completed revoke. A payment.failed alone
//     never revokes (Razorpay retries; halted revokes if it gives up).
//     A refund of one month's charge also never revokes — the
//     subscription stays active and the next charge still comes.
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
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname === '/grant' && request.method === 'GET') {
      const userId = url.searchParams.get('userId');
      if (!userId) return json({ granted: false }, 400);
      const grant = await env.GRANTS.get(`grant:${userId}`);
      return json({ granted: !!grant });
    }

    if (url.pathname === '/create-subscription' && request.method === 'POST') {
      const { userId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      if (!env.RAZORPAY_PLAN_ID) return json({ error: 'plan not configured' }, 500);
      const existing = await env.GRANTS.get(`grant:${userId}`);
      if (existing) return json({ alreadyGranted: true });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
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
      if (!res.ok) return json({ error: 'subscription failed' }, 502);
      const sub = await res.json();
      await env.GRANTS.put(`pending:${sub.id}`, userId);
      return json({ subscriptionId: sub.id, keyId: env.RAZORPAY_KEY_ID });
    }

    if (url.pathname === '/cancel-subscription' && request.method === 'POST') {
      const { userId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      const grantRaw = await env.GRANTS.get(`grant:${userId}`);
      if (!grantRaw) return json({ nothingToCancel: true });
      let subscriptionId = null;
      try { subscriptionId = JSON.parse(grantRaw).subscription_id || null; } catch { subscriptionId = null; }
      if (!subscriptionId) return json({ nothingToCancel: true });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const res = await fetch(`https://api.razorpay.com/v1/subscriptions/${subscriptionId}/cancel`, {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cancel_at_cycle_end: 1 }),
      });
      if (!res.ok) return json({ error: 'cancel failed' }, 502);
      return json({ ok: true });
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
            await env.GRANTS.delete(`grant:${userId}`);
            await env.GRANTS.delete(`sub:${subId}`);
            await env.GRANTS.delete(`pending:${subId}`);
          }
        }
      }
      // payment.failed: deliberately ignored — Razorpay retries the
      // charge, and the subscription stays active until it is halted,
      // at which point subscription.halted revokes. A refund of one
      // month's charge is likewise ignored: the subscription governs,
      // not individual payments.
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },
};
