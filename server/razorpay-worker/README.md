# BotSquad Razorpay Worker — setup

This Worker is the only place Razorpay secrets live. The app never
sees the key secret or the webhook secret.

## 1. Create the Worker + KV

```
wrangler kv namespace create GRANTS
# put the printed id into wrangler.toml (replace REPLACE_WITH_YOUR_KV_NAMESPACE_ID)
```

## 2. Secrets (never commit these)

```
wrangler secret put RAZORPAY_KEY_ID
wrangler secret put RAZORPAY_KEY_SECRET
wrangler secret put RAZORPAY_WEBHOOK_SECRET
```

## 3. Deploy

```
wrangler deploy
# note the Worker URL, e.g. https://botsquad-razorpay.<you>.workers.dev
```

## 4. Razorpay dashboard

Settings > Webhooks > Add webhook:
- URL: `<Worker URL>/webhook`
- Events: `payment.captured` only
- Secret: the same value you set as RAZORPAY_WEBHOOK_SECRET

## 5. Wire the app

In `src/lib/premium.ts`, fill in:
- `RAZORPAY_KEY_ID` — the public key id from Razorpay (safe to ship)
- `PREMIUM_WORKER_URL` — the Worker URL from step 3

Then rebuild the APK. Until those two values are filled, the buy
button honestly reports that payments are being set up.

## 6. Test (Razorpay test mode first)

1. Use Razorpay test keys in the Worker secrets.
2. Buy from the app, pay with a test card.
3. Premium must activate only after the webhook arrives (the app
   polls the Worker grant; the checkout success screen alone grants
   nothing).
4. Pay twice for the same user: the second buy must be blocked
   ("already own"), and a retried webhook must not double-grant.
5. Switch to live keys only after test passes.
