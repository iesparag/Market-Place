import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Singleton delivery/logistics config — separate from the general platform
 * `Settings` doc (same upsert-singleton pattern, see modules/settings/settings.model.ts)
 * since this surface is its own concern: how a rider gets found for a task.
 */
const deliverySettingsSchema = new Schema(
  {
    key: { type: String, default: 'delivery', unique: true },
    /** manual = admin/vendor picks a rider by hand. auto = the scoring engine offers it out. */
    assignmentMode: { type: String, enum: ['manual', 'auto'], default: 'manual' },
    /** Weighted 0–1 scoring criteria for automatic rider selection. Must sum to ~1. */
    criteriaWeights: {
      distance: { type: Number, default: 0.35 },
      rating: { type: Number, default: 0.2 },
      activeLoad: { type: Number, default: 0.2 },
      reliability: { type: Number, default: 0.15 },
      vehicleMatch: { type: Number, default: 0.1 },
    },
    /** How long one rider has to accept an auto-offer before it cascades to the next. */
    offerTimeoutSeconds: { type: Number, default: 120 },
    /** How many riders to cascade through before falling back to manual + admin alert. */
    maxOfferCascadeAttempts: { type: Number, default: 5 },
    /** Only consider riders within this radius (km) of the pickup point. */
    maxAssignRadiusKm: { type: Number, default: 10 },
    /** Cities (lowercase) our own rider fleet covers. Orders dropping outside this list
     *  route to the third-party logistics provider instead — see delivery-tasks.service.ts. */
    serviceableCities: { type: [String], default: [] },
    /** If a drop city isn't in `serviceableCities`, dispatch it to the third-party
     *  provider. When false, it falls back to our own fleet regardless (no courier to send). */
    thirdPartyFallbackEnabled: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type DeliverySettingsDoc = InferSchemaType<typeof deliverySettingsSchema>;
export const DeliverySettings = model('DeliverySettings', deliverySettingsSchema);

const DEFAULTS = {
  assignmentMode: 'manual' as const,
  criteriaWeights: { distance: 0.35, rating: 0.2, activeLoad: 0.2, reliability: 0.15, vehicleMatch: 0.1 },
  offerTimeoutSeconds: 120,
  maxOfferCascadeAttempts: 5,
  maxAssignRadiusKm: 10,
  serviceableCities: [] as string[],
  thirdPartyFallbackEnabled: true,
};

export async function getDeliverySettings() {
  const doc = await DeliverySettings.findOneAndUpdate(
    { key: 'delivery' },
    { $setOnInsert: { key: 'delivery' } },
    { new: true, upsert: true },
  ).lean();
  return { ...DEFAULTS, ...doc };
}
