import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Every inbound third-party-courier webhook, recorded before it is acted on.
 * Same shape and reasoning as payments/payment-event.model.ts: `eventId` is uniquely
 * indexed per provider so a retried delivery is recognised and acked as a no-op
 * instead of double-applying a status change.
 */
const logisticsEventSchema = new Schema(
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
    taskId: { type: Schema.Types.ObjectId, ref: 'DeliveryTask', index: true },
    externalTaskId: String,
    error: String,
    processedAt: Date,
    payload: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

logisticsEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });

export type LogisticsEventDoc = InferSchemaType<typeof logisticsEventSchema>;
export const LogisticsEvent = model('LogisticsEvent', logisticsEventSchema);
