import { Schema, model, type InferSchemaType } from 'mongoose';

/** How the customer is paying. `mock` only exists when no gateway keys are configured. */
export const PAYMENT_METHODS = ['razorpay', 'cod', 'mock'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/**
 * created  → gateway order made, customer hasn't paid yet
 * attempted→ at least one failed/abandoned attempt
 * paid     → money captured (or COD collected)
 * failed   → terminal failure on the last attempt (customer may retry → new attempt)
 * refunded / partially_refunded → money sent back
 */
export const PAYMENT_STATUSES = [
  'created',
  'attempted',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatusValue = (typeof PAYMENT_STATUSES)[number];

const attemptSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    providerPaymentId: String,
    status: String, // authorized | captured | failed
    method: String, // upi | card | netbanking | wallet
    errorCode: String,
    errorDescription: String,
  },
  { _id: false },
);

const refundSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    refundId: { type: String, required: true },
    amount: { type: Number, required: true }, // minor units
    status: { type: String, default: 'processed' }, // pending | processed | failed
    reason: String,
    by: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false },
);

/**
 * One payment record per (order, gateway order). Retrying a failed payment reuses
 * this doc and appends an attempt, so an order never has two competing "paid" rows.
 * See docs/05-PAYMENTS.md.
 */
const paymentSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    orderNumber: { type: String, index: true },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeIds: { type: [Schema.Types.ObjectId], ref: 'Store', default: [], index: true },

    provider: { type: String, required: true }, // razorpay | mock | cod
    method: { type: String, enum: PAYMENT_METHODS, required: true },
    // Unique so a duplicate gateway callback can never spawn a second payment row.
    providerOrderId: { type: String, index: true, unique: true, sparse: true },
    providerPaymentId: { type: String, index: true, sparse: true },

    amount: { type: Number, required: true }, // minor units, what we asked for
    amountPaid: { type: Number, default: 0 }, // what the gateway actually captured
    refundedAmount: { type: Number, default: 0 },
    currency: { type: String, default: 'INR' },

    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    paidAt: Date,
    failedAt: Date,
    failureReason: String,

    attempts: { type: [attemptSchema], default: [] },
    refunds: { type: [refundSchema], default: [] },
  },
  { timestamps: true },
);

// Finance screens list newest-first, usually filtered by status.
paymentSchema.index({ createdAt: -1 });
paymentSchema.index({ status: 1, createdAt: -1 });

export type PaymentDoc = InferSchemaType<typeof paymentSchema>;
export const Payment = model('Payment', paymentSchema);
