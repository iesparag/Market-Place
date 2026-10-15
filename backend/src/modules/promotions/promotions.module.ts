import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';

/**
 * A scheduled "Deal of the Day" discount on one product. Replaces the old
 * mockDiscounts round-robin in home.module.ts — this is the real thing admin manages
 * from the portal (/deals), reusing the same `promo:manage` permission as coupons.
 */
const promotionSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    discountPercent: { type: Number, required: true, min: 1, max: 95 },
    validFrom: { type: Date, required: true },
    validTo: { type: Date, required: true },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export type PromotionDoc = InferSchemaType<typeof promotionSchema>;
export const Promotion = model('Promotion', promotionSchema);

export interface ActiveDeal {
  product: Record<string, unknown>;
  discountPercent: number;
  originalPrice: number;
  validTo: Date;
}

export const promotionsService = {
  /** Admin: every promotion, newest first. */
  async list() {
    const promos = await Promotion.find().sort({ createdAt: -1 }).lean();
    const productIds = [...new Set(promos.map((p) => String(p.productId)))];
    const products = await Product.find({ _id: { $in: productIds } }).select('title slug images minPrice').lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    return promos.map((p) => ({ ...p, product: byId.get(String(p.productId)) ?? null }));
  },

  async create(input: { productId: string; discountPercent: number; validFrom: Date; validTo: Date }) {
    if (!(await Product.exists({ _id: input.productId }))) throw AppError.notFound('Product not found');
    if (input.validTo <= input.validFrom) throw AppError.badRequest('INVALID_RANGE', 'validTo must be after validFrom');
    return Promotion.create(input);
  },

  async update(id: string, patch: Partial<{ discountPercent: number; validFrom: Date; validTo: Date; active: boolean }>) {
    const doc = await Promotion.findByIdAndUpdate(id, patch, { new: true });
    if (!doc) throw AppError.notFound('Promotion not found');
    return doc;
  },

  async remove(id: string) {
    const res = await Promotion.findByIdAndDelete(id);
    if (!res) throw AppError.notFound('Promotion not found');
    return { deleted: true };
  },

  /**
   * Public: currently-live deals for the home feed "Deals of the Day" section — real
   * discount%, real original price (derived from the live product price, not a fabricated
   * formula), and the real soonest validTo so the countdown on the client is honest.
   * Only ACTIVE + currently-in-window promotions on ACTIVE products from APPROVED stores
   * count — no silent fallback to fake data when there are none; the section is simply
   * empty, same contract as every other "no items" case.
   */
  async activeDeals(limit: number): Promise<ActiveDeal[]> {
    const now = new Date();
    const promos = await Promotion.find({ active: true, validFrom: { $lte: now }, validTo: { $gte: now } })
      .sort({ validTo: 1 }) // soonest-expiring first — most urgent deals lead
      .limit(limit * 2) // headroom in case some products resolve to inactive/unapproved
      .lean();
    if (!promos.length) return [];

    const approvedStoreIds = new Set((await Store.find({ status: 'approved' }).select('_id').lean()).map((s) => String(s._id)));
    const products = await Product.find({
      _id: { $in: promos.map((p) => p.productId) },
      status: 'active',
      visibility: 'public',
    }).lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));

    const deals: ActiveDeal[] = [];
    for (const promo of promos) {
      const product = byId.get(String(promo.productId));
      if (!product || !approvedStoreIds.has(String(product['storeId']))) continue;
      const minPrice = Number(product['minPrice'] || 0);
      const originalPrice = Math.round(minPrice / (1 - promo.discountPercent / 100));
      deals.push({ product, discountPercent: promo.discountPercent, originalPrice, validTo: promo.validTo });
      if (deals.length >= limit) break;
    }
    return deals;
  },
};

const PromotionSchema = z.object({
  productId: z.string().min(1),
  discountPercent: z.number().int().min(1).max(95),
  validFrom: z.coerce.date(),
  validTo: z.coerce.date(),
});

export const promotionsRoutes = Router();
promotionsRoutes.get('/', authenticate, authorize('promo:manage'), asyncHandler(async (_req, res) => ok(res, await promotionsService.list())));
promotionsRoutes.post('/', authenticate, authorize('promo:manage'), asyncHandler(async (req, res) => created(res, await promotionsService.create(PromotionSchema.parse(req.body)))));
promotionsRoutes.patch('/:id', authenticate, authorize('promo:manage'), asyncHandler(async (req, res) => ok(res, await promotionsService.update(req.params.id!, PromotionSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body)))));
promotionsRoutes.delete('/:id', authenticate, authorize('promo:manage'), asyncHandler(async (req, res) => ok(res, await promotionsService.remove(req.params.id!))));
