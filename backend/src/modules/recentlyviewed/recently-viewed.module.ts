import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';
import { getSettings } from '../settings/settings.model.js';

/**
 * "Recently viewed" — products a customer opened but hasn't (yet) bought, shown back
 * to them on the home screen next visit as a purchase nudge. One row per user+product,
 * re-touched (not duplicated) on every repeat view — `updatedAt` is the recency signal
 * Mongoose keeps current automatically on both the initial upsert and every later touch.
 */
const recentlyViewedSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  },
  { timestamps: true },
);
recentlyViewedSchema.index({ userId: 1, productId: 1 }, { unique: true });
export type RecentlyViewedDoc = InferSchemaType<typeof recentlyViewedSchema>;
export const RecentlyViewed = model('RecentlyViewed', recentlyViewedSchema);

export const recentlyViewedRoutes = Router();
recentlyViewedRoutes.use(authenticate);

const TouchSchema = z.object({ productId: z.string().min(1) });

recentlyViewedRoutes.post(
  '/',
  asyncHandler(async (req, res) => {
    const { productId } = TouchSchema.parse(req.body);
    const settings = await getSettings();
    if (!settings.features.recentlyViewedEnabled) return void ok(res, { tracked: false });
    await RecentlyViewed.updateOne(
      { userId: req.user!.id, productId },
      { $setOnInsert: { userId: req.user!.id, productId } },
      { upsert: true },
    );
    ok(res, { tracked: true });
  }),
);

recentlyViewedRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    const settings = await getSettings();
    if (!settings.features.recentlyViewedEnabled) return void ok(res, []);
    const limit = Math.min(Number(req.query.limit) || 10, 30);
    const rows = await RecentlyViewed.find({ userId: req.user!.id })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .select('productId')
      .lean();
    const ids = rows.map((r) => String(r.productId));
    if (!ids.length) return void ok(res, []);

    const products = await Product.find({ _id: { $in: ids }, status: 'active', visibility: 'public' })
      .select('title slug variants images ratingAvg ratingCount storeId minPrice foodType attributes')
      .lean();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const stores = await Store.find({ _id: { $in: products.map((p) => p.storeId) }, status: 'approved' })
      .select('name slug')
      .lean();
    const storeMap = new Map(stores.map((s) => [String(s._id), s]));

    // Preserve recency order; silently drop a product that's since gone inactive/deleted
    // or whose vendor is no longer approved — a stale card is worse than one fewer card.
    const ordered = ids
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p) && storeMap.has(String(p!.storeId)))
      .map((p) => ({ ...p, store: storeMap.get(String(p.storeId)) ?? null }));
    ok(res, ordered);
  }),
);
