import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { percentOf } from '../../common/money.js';

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, index: true },
    type: { type: String, enum: ['percent', 'flat'], required: true },
    value: { type: Number, required: true }, // percent (0-100) or flat minor units
    minSubtotal: { type: Number, default: 0 },
    maxDiscount: Number, // cap for percent coupons (minor units)
    active: { type: Boolean, default: true },
    expiresAt: Date,
    usageLimit: Number,
    usedCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);
export type CouponDoc = InferSchemaType<typeof couponSchema>;
export const Coupon = model('Coupon', couponSchema);

/** Validate a code against a cart subtotal → discount (minor units). Throws if invalid. */
export async function computeDiscount(code: string, itemsTotal: number): Promise<{ code: string; discount: number }> {
  const coupon = await Coupon.findOne({ code: code.toUpperCase() });
  if (!coupon || !coupon.active) throw AppError.badRequest('COUPON_INVALID', 'Invalid coupon');
  if (coupon.expiresAt && coupon.expiresAt < new Date()) throw AppError.badRequest('COUPON_EXPIRED', 'Coupon expired');
  if (coupon.usageLimit != null && coupon.usedCount >= coupon.usageLimit) throw AppError.badRequest('COUPON_USED_UP', 'Coupon exhausted');
  if (itemsTotal < (coupon.minSubtotal ?? 0)) throw AppError.badRequest('COUPON_MIN', `Min order ₹${(coupon.minSubtotal ?? 0) / 100}`);
  let discount = coupon.type === 'percent' ? percentOf(itemsTotal, coupon.value) : coupon.value;
  if (coupon.type === 'percent' && coupon.maxDiscount) discount = Math.min(discount, coupon.maxDiscount);
  discount = Math.min(discount, itemsTotal);
  return { code: coupon.code, discount };
}

export async function markCouponUsed(code: string): Promise<void> {
  await Coupon.updateOne({ code: code.toUpperCase() }, { $inc: { usedCount: 1 } });
}

const CreateCouponSchema = z.object({
  code: z.string().min(3),
  type: z.enum(['percent', 'flat']),
  value: z.number().positive(),
  minSubtotal: z.number().int().min(0).optional(),
  maxDiscount: z.number().int().min(0).optional(),
  usageLimit: z.number().int().min(1).optional(),
  expiresAt: z.string().optional(),
});

export const couponsRoutes = Router();

// Public: validate a code at checkout
couponsRoutes.post(
  '/validate',
  authenticate,
  asyncHandler(async (req, res) => {
    const { code, itemsTotal } = z.object({ code: z.string(), itemsTotal: z.number().int().positive() }).parse(req.body);
    ok(res, await computeDiscount(code, itemsTotal));
  }),
);

// Admin manage
couponsRoutes.get('/', authenticate, authorize('promo:manage'), asyncHandler(async (_req, res) => {
  ok(res, await Coupon.find().sort({ createdAt: -1 }).lean());
}));
couponsRoutes.post('/', authenticate, authorize('promo:manage'), asyncHandler(async (req, res) => {
  const input = CreateCouponSchema.parse(req.body);
  created(res, await Coupon.create({ ...input, code: input.code.toUpperCase(), expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined }));
}));
couponsRoutes.patch('/:id', authenticate, authorize('promo:manage'), asyncHandler(async (req, res) => {
  const active = z.boolean().parse(req.body.active);
  ok(res, await Coupon.findByIdAndUpdate(req.params.id, { active }, { new: true }).lean());
}));
