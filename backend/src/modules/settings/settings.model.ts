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
