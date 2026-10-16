import { Schema, model, type InferSchemaType } from 'mongoose';

const storeSchema = new Schema(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    vendorType: {
      type: String,
      enum: ['food', 'grocery', 'fashion', 'generic', 'integration'],
      default: 'generic',
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended', 'rejected'],
      default: 'pending',
      index: true,
    },
    description: { type: String, default: '' },
    logo: String,
    banner: String,
    coverImages: { type: [String], default: [] }, // storefront header carousel (LinkedIn-style)
    // Business / KYC details (India)
    legalName: String,
    gstin: String,
    pan: String,
    establishedYear: Number,
    contactEmail: String,
    contactPhone: String,
    website: String,
    address: {
      line1: String,
      city: String,
      state: String,
      pincode: String,
    },
    /**
     * GeoJSON point resolved from `address` via Places/geocoding at registration or edit time.
     * Deliberately left absent (not [0,0]) when unresolved, so $geoNear/$near correctly
     * exclude unresolved stores instead of placing them at the Gulf of Guinea.
     */
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: { type: [Number], default: undefined },
    },
    social: {
      instagram: String,
      facebook: String,
      twitter: String,
    },
    /** Where payouts are sent. Held on the store, editable by the vendor + admin. */
    bankAccount: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      upiId: String,
      /** Set by an admin once the details are checked against the KYC docs. */
      verified: { type: Boolean, default: false },
    },
    commissionOverride: {
      type: { type: String, enum: ['percent', 'flat'] },
      value: Number,
    },
    ratingAvg: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    /**
     * Availability — drives the "Now" (instant-delivery) feed. `availabilityStatus`
     * is a manual override a vendor (or admin, on their behalf — same owner-or-admin
     * check as the rest of this schema's edits) can set at any time: 'open' forces
     * visible-now regardless of schedule, 'closed'/'holiday' forces hidden regardless
     * of schedule, 'auto' (default) computes it live from `operatingHours` + `holidays`
     * — see isStoreOpenNow() below, the single place this logic lives.
     */
    availabilityStatus: {
      type: String,
      enum: ['auto', 'open', 'closed', 'holiday'],
      default: 'auto',
    },
    /** One entry per weekday (0=Sunday..6=Saturday). `open`/`close` are "HH:mm" (24h, IST). */
    operatingHours: {
      type: [
        {
          _id: false,
          day: { type: Number, min: 0, max: 6, required: true },
          open: { type: String, default: '09:00' },
          close: { type: String, default: '21:00' },
          closed: { type: Boolean, default: false },
        },
      ],
      default: () => Array.from({ length: 7 }, (_, day) => ({ day, open: '09:00', close: '21:00', closed: false })),
    },
    /** One-off dates (ISO "YYYY-MM-DD", IST) the store is shut despite its regular hours. */
    holidays: { type: [String], default: [] },
  },
  { timestamps: true },
);

storeSchema.index({ location: '2dsphere' });

export type StoreDoc = InferSchemaType<typeof storeSchema>;
export const Store = model('Store', storeSchema);

type AvailabilityFields = {
  availabilityStatus?: string | null;
  operatingHours?: { day: number; open: string; close: string; closed: boolean }[] | null;
  holidays?: string[] | null;
};

/**
 * Single source of truth for "is this store open right now" — used by the storefront
 * (badge) and the "Now" instant-delivery feed (inclusion filter). India-only platform,
 * so IST is hardcoded rather than threaded through as a per-store timezone.
 */
export function isStoreOpenNow(store: AvailabilityFields, at: Date = new Date()): boolean {
  if (store.availabilityStatus === 'open') return true;
  if (store.availabilityStatus === 'closed' || store.availabilityStatus === 'holiday') return false;

  const ist = new Date(at.getTime() + 5.5 * 60 * 60_000);
  const todayISO = ist.toISOString().slice(0, 10);
  if (store.holidays?.includes(todayISO)) return false;

  const day = ist.getUTCDay();
  const hours = store.operatingHours?.find((h) => h.day === day);
  if (!hours || hours.closed) return false;

  const [oh = NaN, om = NaN] = hours.open.split(':').map(Number);
  const [ch = NaN, cm = NaN] = hours.close.split(':').map(Number);
  if ([oh, om, ch, cm].some((n) => Number.isNaN(n))) return false;
  const nowMin = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return nowMin >= oh * 60 + om && nowMin < ch * 60 + cm;
}
