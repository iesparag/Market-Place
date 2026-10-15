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
  },
  { timestamps: true },
);

storeSchema.index({ location: '2dsphere' });

export type StoreDoc = InferSchemaType<typeof storeSchema>;
export const Store = model('Store', storeSchema);
