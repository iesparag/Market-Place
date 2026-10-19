import { Schema, model, type InferSchemaType } from 'mongoose';

/**
 * Customer loyalty points ledger — deliberately separate from `ledger/ledger.model.ts`
 * (that one is vendor-money, store-scoped, double-entry accounts). This is a simpler
 * single-account points balance per customer. Balance is DERIVED (summed), never
 * mutated in place, for the same reason the money ledger works that way: a replayed
 * webhook or retried request can never double-post with a unique idempotencyKey.
 */
const loyaltyEntrySchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    orderId: { type: Schema.Types.ObjectId, ref: 'Order', index: true },
    type: { type: String, enum: ['earn', 'redeem', 'refund'], required: true },
    points: { type: Number, required: true }, // redeem entries are negative
    note: String,
    idempotencyKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true },
);

export type LoyaltyEntryDoc = InferSchemaType<typeof loyaltyEntrySchema>;
export const LoyaltyEntry = model('LoyaltyEntry', loyaltyEntrySchema);
