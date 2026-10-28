// Ads + premium — PLACEHOLDER WIRING ONLY, DISABLED in the GitHub v1.
// SECURITY / SCOPE FIX 2026-10-28: the user deferred ads, payments, and
// login to a later version. Shipping a fake "Ad — placeholder" slot and a
// button that grants premium with no payment would mislead users and
// would be a fake-purchase path if ever wired to a real store. So the ad
// slot is gated off here (ADS_ENABLED = false) and the Settings purchase
// button is removed in settings.tsx. The placeholder IDs below remain for
// a future, properly wired AdMob / Play Billing or Razorpay build only.
// TODO: replace these placeholders with real IDs before any release that
// actually shows ads or takes payment. No real ID is invented here.
// Premium rule (when it returns): premium removes ads ONLY. It never locks a feature.
export const ADS_ENABLED = false;
export const ADS_PLACEHOLDER = {
  bannerUnitId: 'TODO_ADMOB_BANNER_UNIT_ID',
  interstitialUnitId: 'TODO_ADMOB_INTERSTITIAL_UNIT_ID',
  removeAdsProductId: 'TODO_PLAY_REMOVE_ADS_PRODUCT_ID',
} as const;

export interface PremiumState {
  adsRemoved: boolean;
  placeholderPurchase: boolean; // true only when the placeholder flow was used
}

// The placeholder purchase flow is deliberately labelled in the UI.
// In production this function must be replaced by a verified Play Billing
// purchase + restore, and this flag must only be set after verification.
export function placeholderBuyRemoveAds(): PremiumState {
  return { adsRemoved: true, placeholderPurchase: true };
}

export function placeholderRestorePurchases(): PremiumState {
  return { adsRemoved: false, placeholderPurchase: false };
}
