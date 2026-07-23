import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Money ledger. Every payment/payout writes entries here — the single source of
 * financial truth. Balances are DERIVED (aggregated), never mutated in place.
 * idempotencyKey (unique) prevents double-posting on retries.
 */
const ledgerSchema = new Schema(
  {
    at: { type: Date, default: Date.now },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', index: true },
    account: {
      type: String,
      enum: ['vendor_payable', 'vendor_paid', 'commission_income', 'platform_cash', 'refund'],
      required: true,
    },
    amount: { type: Number, required: true }, // minor units, positive
    currency: { type: String, default: 'INR' },
    idempotencyKey: { type: String, unique: true, sparse: true },
    refType: String,
    refId: String,
  },
  { timestamps: true },
);

export type LedgerDoc = InferSchemaType<typeof ledgerSchema>;
export const Ledger = model('LedgerEntry', ledgerSchema);
