import { Schema, model, type InferSchemaType } from 'mongoose';

const payoutSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['paid', 'pending', 'failed'], default: 'paid' },
    method: { type: String, default: 'manual' },
    providerRef: String,
  },
  { timestamps: true },
);

export type PayoutDoc = InferSchemaType<typeof payoutSchema>;
export const Payout = model('Payout', payoutSchema);
