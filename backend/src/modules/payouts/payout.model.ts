import { Schema, model, type InferSchemaType } from 'mongoose';

const payoutSchema = new Schema(
  {
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true, index: true },
    amount: { type: Number, required: true },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: ['paid', 'pending', 'failed'], default: 'paid' },
    /** manual = admin sent it via their own bank/UPI and recorded the reference here. */
    method: { type: String, default: 'manual' },
    providerRef: String,
    /** Bank UTR / UPI transaction reference — what the vendor will quote back to you. */
    reference: String,
    note: String,
    /** Snapshot of where it went, so history survives a later bank-detail change. */
    payTo: {
      accountName: String,
      accountNumber: String,
      ifsc: String,
      upiId: String,
    },
    periodStart: Date,
    periodEnd: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export type PayoutDoc = InferSchemaType<typeof payoutSchema>;
export const Payout = model('Payout', payoutSchema);
