import { Schema, model, type InferSchemaType } from 'mongoose';

const orderItemSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
    title: String,
    variantSku: String,
    variantLabel: String,
    image: String,
    qty: { type: Number, required: true },
    unitPrice: { type: Number, required: true }, // minor units, incl. modifiers
    modifiers: [{ name: String, priceDelta: Number }],
    lineTotal: { type: Number, required: true },
  },
  { _id: false },
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    items: { type: [orderItemSchema], default: [] },
    storeIds: { type: [Schema.Types.ObjectId], index: true }, // for vendor filtering
    // Per-vendor note from the customer (cart screen → "Instructions for <store>") —
    // keyed by storeId since one order can span several vendors and a note for one
    // doesn't apply to the others. Copied onto each DeliveryTask at createForOrder()
    // time so the vendor sees exactly their own instruction, not the whole map.
    storeInstructions: { type: Map, of: String, default: undefined },
    deliverySlots: { type: Map, of: Object, default: undefined },
    couponCode: String,
    pointsRedeemed: { type: Number, default: 0 },
    amounts: {
      itemsTotal: Number,
      discount: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      delivery: { type: Number, default: 0 },
      grandTotal: Number,
    },
    currency: { type: String, default: 'INR' },
    status: {
      type: String,
      enum: ['pending', 'paid', 'fulfilled', 'cancelled', 'refunded'],
      default: 'pending',
      index: true,
    },
    /**
     * Payment state lives here; `status` above tracks the *fulfillment* lifecycle.
     * An order is only ever moved to `paid` by the settlement service (atomic claim),
     * never directly by a controller. See docs/05-PAYMENTS.md.
     */
    payment: {
      method: { type: String, enum: ['razorpay', 'cod', 'mock'] },
      provider: String,
      status: {
        type: String,
        enum: ['unpaid', 'pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
        default: 'unpaid',
        index: true,
      },
      paymentId: { type: Schema.Types.ObjectId, ref: 'Payment' },
      providerOrderId: String,
      providerPaymentId: String,
      paidAt: Date,
      /** COD only: set when the rider/vendor collected the cash. */
      collectedAt: Date,
      refundedAmount: { type: Number, default: 0 },
    },
    // Per-store commission snapshot (frozen at pay time — later rate changes don't rewrite history).
    commissions: [
      {
        storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
        subtotal: Number,
        rate: Number,
        amount: Number,
        payable: Number,
      },
    ],
    contact: { name: String, phone: String, email: String },
    // lat/lng (from the customer's saved Address) feed DeliveryTask.dropAddress, which
    // in turn drives the live rider→destination polyline — see delivery-tasks.service.ts.
    shippingAddress: {
      line1: String, line2: String, landmark: String, city: String, state: String, pincode: String,
      lat: Number, lng: Number,
    },
  },
  { timestamps: true },
);

export type OrderDoc = InferSchemaType<typeof orderSchema>;
export const Order = model('Order', orderSchema);
