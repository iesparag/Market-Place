import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * A delivery rider — a separate identity from `User` on purpose: riders don't need
 * marketplace roles/permissions/storeId, they need their own auth scope (see
 * middleware/authenticateRider.ts) and delivery-specific fields (location, vehicle,
 * load). `tenantId` is a first-class field from day one (default = this marketplace)
 * so a future third-party-sellable rider pool doesn't need a schema-wide backfill.
 */
const riderSchema = new Schema(
  {
    tenantId: { type: String, default: 'platform', index: true },
    name: { type: String, required: true },
    phone: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    vehicleType: { type: String, enum: ['bike', 'scooter', 'bicycle', 'car', 'van'], default: 'bike' },
    status: { type: String, enum: ['offline', 'available', 'busy'], default: 'offline', index: true },
    currentLocation: {
      lat: Number,
      lng: Number,
      at: Date,
    },
    rating: { type: Number, default: 5 },
    ratingCount: { type: Number, default: 0 },
    activeTaskCount: { type: Number, default: 0 },
    totalDeliveries: { type: Number, default: 0 },
    // Rolling counters for the auto-assignment reliability score (Phase 3).
    offersReceived: { type: Number, default: 0 },
    offersAccepted: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type RiderDoc = InferSchemaType<typeof riderSchema>;
export const Rider = model('Rider', riderSchema);
