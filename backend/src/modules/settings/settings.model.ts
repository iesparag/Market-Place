import { Schema, model, type InferSchemaType } from 'mongoose';
import { DEFAULTS } from '@app/shared';

/** Singleton platform settings. */
const settingsSchema = new Schema(
  {
    key: { type: String, default: 'platform', unique: true },
    commissionPercent: { type: Number, default: DEFAULTS.COMMISSION_PERCENT },
    taxPercent: { type: Number, default: 5 }, // GST-style, applied to (items − discount)
    deliveryFee: { type: Number, default: 4000 }, // minor units (₹40); free above threshold
    freeDeliveryAbove: { type: Number, default: 50000 }, // ₹500
    currency: { type: String, default: DEFAULTS.CURRENCY },
    payoutHoldDays: { type: Number, default: DEFAULTS.PAYOUT_HOLD_DAYS },
    // ── Payments (docs/05-PAYMENTS.md) ───────────────────────────────────────
    /** Show "Cash on delivery" at checkout. */
    codEnabled: { type: Boolean, default: true },
    /** Max order value payable by COD, minor units. 0 = no cap. */
    codMaxOrderValue: { type: Number, default: 500000 }, // ₹5,000
    /** Show online payment (UPI/card/netbanking) at checkout. */
    onlinePaymentEnabled: { type: Boolean, default: true },
    /** Cancel + restock an unpaid online order after this long. 0 disables the sweep. */
    paymentExpiryMinutes: { type: Number, default: 30 },
    // ── Loyalty & referral (docs/06-ROADMAP.md) ──────────────────────────────
    /** Earn 1 point per this many rupees spent (minor units: 1000 = ₹10). */
    loyaltyEarnDivisor: { type: Number, default: 1000 },
    /** Redemption rate: 1 point = this many minor units off. */
    loyaltyPointValuePaise: { type: Number, default: 10 },
    /** Cap on how much of an order's subtotal points can zero out, 0–1. */
    loyaltyMaxRedeemShare: { type: Number, default: 0.5 },
    /** Points credited to the referrer when their invite's first order is delivered. */
    referralRewardPoints: { type: Number, default: 1000 },
    // ── Feature flags — admin on/off switches, enforced server-side (not just UI
    // hiding) so "off" really means off across app + website, no rebuild needed. ──
    features: {
      couponsEnabled: { type: Boolean, default: true },
      loyaltyEnabled: { type: Boolean, default: true },
      referralEnabled: { type: Boolean, default: true },
      frequentlyBoughtTogetherEnabled: { type: Boolean, default: true },
      wishlistPriceDropAlertsEnabled: { type: Boolean, default: true },
      recentlyViewedEnabled: { type: Boolean, default: true },
      checkoutAdBannerEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export type SettingsDoc = InferSchemaType<typeof settingsSchema>;
export const Settings = model('Settings', settingsSchema);

const SETTINGS_DEFAULTS = {
  commissionPercent: DEFAULTS.COMMISSION_PERCENT,
  taxPercent: 5,
  deliveryFee: 4000,
  freeDeliveryAbove: 50000,
  currency: DEFAULTS.CURRENCY,
  payoutHoldDays: DEFAULTS.PAYOUT_HOLD_DAYS,
  codEnabled: true,
  codMaxOrderValue: 500000,
  onlinePaymentEnabled: true,
  paymentExpiryMinutes: 30,
  loyaltyEarnDivisor: 1000,
  loyaltyPointValuePaise: 10,
  loyaltyMaxRedeemShare: 0.5,
  referralRewardPoints: 1000,
  features: {
    couponsEnabled: true,
    loyaltyEnabled: true,
    referralEnabled: true,
    frequentlyBoughtTogetherEnabled: true,
    wishlistPriceDropAlertsEnabled: true,
    recentlyViewedEnabled: true,
    checkoutAdBannerEnabled: true,
  },
};

export async function getSettings() {
  const doc = await Settings.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { new: true, upsert: true },
  ).lean();
  // Backfill any fields added after this doc was first created. `features` is nested,
  // so it needs its own merge — a plain top-level spread would drop any flag added
  // here after a doc already has a (now-incomplete) `features` object saved.
  return {
    ...SETTINGS_DEFAULTS,
    ...doc,
    features: { ...SETTINGS_DEFAULTS.features, ...doc.features },
  };
}
