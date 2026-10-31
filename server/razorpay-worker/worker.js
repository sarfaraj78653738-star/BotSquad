// BotSquad Razorpay Worker (Cloudflare Workers, no dependencies).
// This is the ONLY place that may touch Razorpay secrets. Env vars
// (set with `wrangler secret put`, never in code or in the app):
//   RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
// KV binding: GRANTS (see wrangler.toml).
//
// Price: $5 one time = 500 USD cents, fixed HERE. The app never sends
// an amount — a client that could set its own price could pay $0.01
// for premium.
//
// Endpoints:
//   POST /create-order { userId } -> { orderId, keyId, amount, currency }
//     or { alreadyGranted: true } when the user already owns premium.
//   POST /webhook — Razorpay calls this. The signature is verified with
//     the webhook secret before anything is trusted. On a verified
//     payment.captured, the grant is stored ONCE per payment id.
//   GET  /grant?userId=... -> { granted: true|false }
//
// One-charge idempotency: the app reuses a pending order id, and this
// Worker refuses a second grant for the same payment id even if
// Razorpay retries the webhook.

const PRICE_CENTS = 500;
const CURRENCY = 'USD';

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

    if (url.pathname === '/create-order' && request.method === 'POST') {
      const { userId } = await request.json().catch(() => ({}));
      if (!userId) return json({ error: 'userId required' }, 400);
      const existing = await env.GRANTS.get(`grant:${userId}`);
      if (existing) return json({ alreadyGranted: true });
      const auth = btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
      const res = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: PRICE_CENTS,
          currency: CURRENCY,
          receipt: `botsquad_${userId}_${Date.now()}`,
          notes: { userId },
        }),
      });
      if (!res.ok) return json({ error: 'order failed' }, 502);
      const order = await res.json();
      await env.GRANTS.put(`pending:${order.id}`, userId);
      return json({ orderId: order.id, keyId: env.RAZORPAY_KEY_ID, amount: PRICE_CENTS, currency: CURRENCY });
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
      if (event.event === 'payment.captured') {
        const payment = event.payload?.payment?.entity;
        const paymentId = payment?.id;
        const orderId = payment?.order_id;
        if (paymentId && orderId) {
          // Dedupe: a retried webhook for the same payment grants once.
          const done = await env.GRANTS.get(`payment:${paymentId}`);
          if (!done) {
            const userId = await env.GRANTS.get(`pending:${orderId}`);
            if (userId) {
              await env.GRANTS.put(
                `grant:${userId}`,
                JSON.stringify({ payment_id: paymentId, order_id: orderId, at: new Date().toISOString() }),
              );
              await env.GRANTS.put(`payment:${paymentId}`, userId);
              await env.GRANTS.delete(`pending:${orderId}`);
            }
          }
        }
      }
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  },
};
