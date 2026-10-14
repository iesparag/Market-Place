import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { User } from '../auth/user.model.js';
import { notify } from '../notifications/notifications.module.js';
import { whatsappProvider } from '../../providers/whatsapp/index.js';
import { WhatsAppTemplate } from '../whatsapp/whatsapp.module.js';

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

// ── Admin: abandoned-cart recovery campaign ──────────────────────────────────────
// The evening sweeper (jobs/schedulers/cart-reminder-sweep.ts) nudges automatically;
// this lets an admin see who's sitting on an abandoned cart right now and blast a
// one-off discount at a hand-picked list via push + WhatsApp in a single click.

/** Everyone with items currently sitting in their cart, newest-abandoned first. */
cartRoutes.get('/abandoned', authorize('notification:manage'), asyncHandler(async (_req, res) => {
  const carts = await Cart.find({ 'items.0': { $exists: true } })
    .sort({ firstAbandonedAt: -1 })
    .limit(500)
    .lean();
  const users = await User.find({ _id: { $in: carts.map((c) => c.userId) } })
    .select('name email phone')
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  ok(
    res,
    carts.map((c) => {
      const u = byId.get(String(c.userId));
      return {
        userId: String(c.userId),
        name: u?.name ?? '',
        email: u?.email ?? '',
        phone: u?.phone ?? '',
        itemCount: c.items.reduce((n, i) => n + i.qty, 0),
        total: c.items.reduce((n, i) => n + i.price * i.qty, 0),
        firstAbandonedAt: c.firstAbandonedAt,
        remindersSent: c.remindersSent,
      };
    }),
  );
}));

const CampaignSchema = z.object({
  userIds: z.array(z.string()).min(1),
  title: z.string().min(1).default('Your cart is waiting 🛒'),
  body: z.string().default(''),
  couponCode: z.string().optional(),
  image: z.string().optional(),
  channels: z.array(z.enum(['push', 'whatsapp'])).min(1).default(['push']),
  whatsappTemplateName: z.string().optional(), // must be an 'approved' WhatsAppTemplate
});

cartRoutes.post('/recovery-campaign', authorize('notification:manage'), asyncHandler(async (req, res) => {
  const input = CampaignSchema.parse(req.body);
  const carts = await Cart.find({ userId: { $in: input.userIds } }).lean();
  const cartByUser = new Map(carts.map((c) => [String(c.userId), c]));
  const users = await User.find({ _id: { $in: input.userIds } }).select('name phone').lean();

  let template: InstanceType<typeof WhatsAppTemplate> | null = null;
  if (input.channels.includes('whatsapp') && input.whatsappTemplateName) {
    template = await WhatsAppTemplate.findOne({ name: input.whatsappTemplateName, status: 'approved' });
  }

  let pushSent = 0;
  let whatsappSent = 0;
  for (const user of users) {
    const cart = cartByUser.get(String(user._id));
    const itemCount = cart?.items.reduce((n, i) => n + i.qty, 0) ?? 0;
    const body = input.body || (input.couponCode
      ? `${itemCount} item(s) waiting for you — use ${input.couponCode} for a discount at checkout.`
      : `${itemCount} item(s) waiting for you — complete your order before it's gone.`);

    if (input.channels.includes('push')) {
      await notify(String(user._id), { type: 'promo', title: input.title, body, link: '/cart', image: input.image });
      pushSent += 1;
    }
    if (input.channels.includes('whatsapp') && template && user.phone) {
      const result = await whatsappProvider.sendTemplate({
        to: user.phone,
        templateName: template.name,
        languageCode: template.language,
        bodyParams: Array.from({ length: template.variableCount }, (_, i) =>
          i === 0 ? (user.name || 'there') : i === 1 ? String(itemCount) : (input.couponCode ?? ''),
        ),
        headerImageUrl: template.hasImageHeader ? input.image : undefined,
      });
      if (result.sent) whatsappSent += 1;
    }
  }

  ok(res, { targeted: input.userIds.length, pushSent, whatsappSent });
}));
