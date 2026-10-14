import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';

const cartItemSchema = new Schema(
  {
    productId: { type: String, required: true },
    variantSku: { type: String, required: true },
    title: { type: String, required: true },
    image: { type: String },
    price: { type: Number, required: true },
    qty: { type: Number, required: true },
  },
  { _id: false },
);

const cartSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    items: { type: [cartItemSchema], default: [] },
    // When items went 0 → >0 — the 5-day abandoned-cart reminder window starts here
    // and resets every time the cart empties out and fills up again.
    firstAbandonedAt: { type: Date, default: null },
    remindersSent: { type: Number, default: 0 },
    lastReminderDate: { type: String, default: null }, // 'YYYY-MM-DD' (IST) — one reminder per day
  },
  { timestamps: true },
);
export type CartDoc = InferSchemaType<typeof cartSchema>;
export const Cart = model('Cart', cartSchema);

export const cartRoutes = Router();
cartRoutes.use(authenticate);

/**
 * Mirrors the customer app's local (on-device) cart server-side. The cart's state of
 * record stays client-side (shared_preferences) — this is a best-effort, fire-and-forget
 * copy whose only purpose is giving the abandoned-cart reminder sweeper
 * (jobs/schedulers/cart-reminder-sweep.ts) something to read.
 */
cartRoutes.put('/sync', asyncHandler(async (req, res) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const existing = await Cart.findOne({ userId: req.user!.id }).select('items').lean();
  const wasEmpty = !existing || existing.items.length === 0;
  const isEmpty = items.length === 0;

  const update: Record<string, unknown> = { items };
  if (isEmpty) {
    update.firstAbandonedAt = null;
    update.remindersSent = 0;
    update.lastReminderDate = null;
  } else if (wasEmpty) {
    // A fresh abandonment episode — restart the 5-day reminder window.
    update.firstAbandonedAt = new Date();
    update.remindersSent = 0;
    update.lastReminderDate = null;
  }
  await Cart.updateOne({ userId: req.user!.id }, { $set: update }, { upsert: true });
  ok(res, { synced: true });
}));
