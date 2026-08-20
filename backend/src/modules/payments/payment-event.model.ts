import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Every inbound gateway webhook, recorded before it is acted on.
 *
 * `eventId` is uniquely indexed per provider: a duplicate delivery (gateways retry
 * aggressively) hits the index, is recognised as already-processed and is acked as a
 * no-op. This is the duka duplicate-callback lesson, enforced at the storage layer.
 */
const paymentEventSchema = new Schema(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    type: { type: String, required: true, index: true },
    status: {
      type: String,
      enum: ['received', 'processed', 'ignored', 'error'],
      default: 'received',
      index: true,
    },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    providerOrderId: String,
    providerPaymentId: { type: String, index: true },
    error: String,
    processedAt: Date,
    /** Raw payload, kept for reconciliation / dispute evidence. */
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

paymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
paymentEventSchema.index({ createdAt: -1 });

export type PaymentEventDoc = InferSchemaType<typeof paymentEventSchema>;
export const PaymentEvent = model('PaymentEvent', paymentEventSchema);
