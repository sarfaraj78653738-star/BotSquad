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
      // Fail closed on the Plan: a mis-typed dashboard Plan must never
      // overcharge a user. Verify amount + currency strictly, and
      // period/interval when the Plan reports them. (Retrieved Plans
      // nest amount/currency under item; fall back to top level.)
      const planRes = await fetch(`https://api.razorpay.com/v1/plans/${env.RAZORPAY_PLAN_ID}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!planRes.ok) return json({ error: 'plan check failed' }, 502);
      const plan = await planRes.json();
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
      if (!res.ok) return json({ error: 'subscription failed' }, 502);
      const sub = await res.json();
      await env.GRANTS.put(`pending:${sub.id}`, userId);
      return json({ subscriptionId: sub.id, keyId: env.RAZORPAY_KEY_ID, amount: planAmount, currency: planCurrency });
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
      if (pendingSubscriptionId && !candidates.includes(pendingSubscriptionId)) candidates.push(pendingSubscriptionId);
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
      if (!env.RAZORPAY_PLAN_ID) return json({ error: 'plan not configured' }, 500);
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const planRes = await fetch(`https://api.razorpay.com/v1/plans/${env.RAZORPAY_PLAN_ID}`, {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!planRes.ok) return json({ error: 'plan check failed' }, 502);
      const plan = await planRes.json();
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
