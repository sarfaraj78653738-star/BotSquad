// Ads + premium (user orders 2026-10-31): premium is Remove Ads, $5
// one time, paid through Razorpay, activated ONLY after the
// Cloudflare Worker confirms a webhook-verified payment (see
// src/lib/premium.ts and server/razorpay-worker/). The old placeholder
// purchase that granted premium with no payment was removed
// 2026-10-28 and must never return.
// Ads themselves are not live yet (no ad network wired): ADS_ENABLED
// stays false until an ad network is connected. Premium removes ads
// ONLY; it never locks a feature.
export const ADS_ENABLED = false;
export const REMOVE_ADS_PRICE_LABEL = '$5';
export const REMOVE_ADS_PRICE_CENTS = 500;
export const REMOVE_ADS_CURRENCY = 'USD';
