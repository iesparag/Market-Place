import { Schema, model, type InferSchemaType } from 'mongoose';

const deliveryTaskItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product' },
    title: String,
    qty: Number,
    image: String,
  },
  { _id: false },
);

/**
 * One per (order, store) pair — the per-vendor fulfillment + delivery leg of an order.
 * Deliberately not a full rebuild of the aspirational `SubOrder` entity from
 * docs/03-DATA-MODEL.md (that's unstarted Phase-4-roadmap scope); this absorbs the
 * same per-vendor lifecycle (vendor accept/prepare → rider pickup/deliver) using the
 * already-defined SubOrderStatusEnum naming, scoped to what the delivery feature needs.
 */
const deliveryTaskSchema = new Schema(
  {
    tenantId: { type: String, default: 'platform', index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [deliveryTaskItemSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'accepted', 'preparing', 'ready', 'shipped', 'delivered', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    statusHistory: {
      type: [{ status: String, at: Date, _id: false }],
      default: [],
    },
    riderId: { type: Schema.Types.ObjectId, ref: 'Rider', index: true },
    assignmentMode: { type: String, enum: ['manual', 'auto'] },
    assignedAt: Date,
    /** The one rider currently being offered this task (auto-assignment only). Cleared
     *  on accept/decline/expiry/manual-assign. See auto-assign.service.ts. */
    offer: {
      riderId: { type: Schema.Types.ObjectId, ref: 'Rider' },
      sentAt: Date,
      expiresAt: Date,
      attempt: Number,
    },
    /** Riders already offered this task and passed on it (declined or timed out) —
     *  skipped on the next ranking pass so the cascade doesn't loop back to them. */
    excludedRiderIds: { type: [Schema.Types.ObjectId], default: [], ref: 'Rider' },
    /** own_fleet = our riders (manual/auto-assigned). third_party = routed to an
     *  external courier — see DeliverySettings.serviceableCities. */
    fulfillmentSource: { type: String, enum: ['own_fleet', 'third_party'], default: 'own_fleet', index: true },
    thirdParty: {
      provider: String,
      externalTaskId: String,
      trackingUrl: String,
    },
    // No lat/lng yet — Store.address and Order.shippingAddress don't carry coordinates
    // today (see Phase 1). Distance-based auto-assignment needs this filled in before
    // it can work; manual assignment doesn't depend on it.
    pickupAddress: { line1: String, city: String, lat: Number, lng: Number },
    dropAddress: { line1: String, city: String, pincode: String, lat: Number, lng: Number },
  },
  { timestamps: true },
);

// One task per (order, store) — guards against double-creation on a retried
// payment confirmation the same way PaymentEvent's unique index guards webhooks.
deliveryTaskSchema.index({ orderId: 1, storeId: 1 }, { unique: true });

export type DeliveryTaskDoc = InferSchemaType<typeof deliveryTaskSchema>;
export const DeliveryTask = model('DeliveryTask', deliveryTaskSchema);
