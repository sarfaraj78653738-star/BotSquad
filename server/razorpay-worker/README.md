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
wrangler secret put RAZORPAY_PLAN_ID
# RAZORPAY_PLAN_ID comes from step 4a (the dashboard Plan id).
```

## 3. Deploy

```
wrangler deploy
# note the Worker URL, e.g. https://botsquad-razorpay.<you>.workers.dev
```

## 4. Razorpay dashboard

### 4a. Create the Plan (do this first — the Worker needs its id)

Subscriptions > Plans > Create Plan:
- Name: `BotSquad Remove Ads`
- Amount: `199`, Currency: `INR`
- Interval: monthly (period: 1 month)
- Copy the Plan id (`plan_...`) into the `RAZORPAY_PLAN_ID` secret
  (step 2). The Plan fixes the price — the app never sends an amount.

### 4b. Webhook

Settings > Webhooks > Add webhook:
- URL: `<Worker URL>/webhook`
- Events: `subscription.activated`, `subscription.charged`,
  `subscription.cancelled`, `subscription.halted`,
  `subscription.paused`, `subscription.completed`,
  `refund.processed`, `payment.dispute.lost`
  (NOT `payment.captured` anymore — subscription status governs.
  `refund.processed` / `payment.dispute.lost` close the pay → refund →
  cancel-before-renewal loophole: they cancel that subscription
  immediately and revoke premium, unless another active subscription
  still covers the user.)
- Secret: the same value you set as RAZORPAY_WEBHOOK_SECRET

## 5. Wire the app

In `src/lib/premium.ts`, fill in:
- `RAZORPAY_KEY_ID` — the public key id from Razorpay (safe to ship)
- `PREMIUM_WORKER_URL` — the Worker URL from step 3

Then rebuild the APK. Until those two values are filled, the buy
button honestly reports that payments are being set up.

## 6. Test (Razorpay test mode first)

1. Use Razorpay test keys in the Worker secrets, and a test-mode Plan.
2. Subscribe from the app, pay with a test card (or test UPI).
3. Premium must activate only after the `subscription.activated`
   webhook arrives (the app polls the Worker grant; the checkout
   success screen alone grants nothing).
4. Subscribe twice for the same user: the second buy must be blocked
   ("already have an active subscription").
5. Cancel from the app: premium must go OFF on relaunch
   (cancellation is immediate — user choice 2026-10-31).
6. Loophole test: refund a test payment from the dashboard →
   that subscription must be cancelled and premium off on relaunch
   (proves the payment → invoice → subscription chain; if it does
   not fire in test mode, fall back to cancelling via the dashboard
   manually whenever a refund is granted).
7. To test revoke without waiting a month: cancel the test
   subscription immediately from the Razorpay dashboard (not the
   app's cancel) → `subscription.cancelled` webhook →
   relaunch the app → premium off, ads return.
8. A failed test payment must NOT revoke premium (only `halted` does).
9. Switch to live keys + a live Plan only after test passes.
