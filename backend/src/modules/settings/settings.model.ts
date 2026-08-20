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
};

export async function getSettings() {
  const doc = await Settings.findOneAndUpdate(
    { key: 'platform' },
    { $setOnInsert: { key: 'platform' } },
    { new: true, upsert: true },
  ).lean();
  // Backfill any fields added after this doc was first created.
  return { ...SETTINGS_DEFAULTS, ...doc };
}
