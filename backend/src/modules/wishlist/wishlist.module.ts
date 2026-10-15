import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';

const wishlistSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  },
  { timestamps: true },
);
wishlistSchema.index({ userId: 1, productId: 1 }, { unique: true });
export type WishlistDoc = InferSchemaType<typeof wishlistSchema>;
export const Wishlist = model('Wishlist', wishlistSchema);

export const wishlistRoutes = Router();
wishlistRoutes.use(authenticate);

wishlistRoutes.get('/', asyncHandler(async (req, res) => {
  const items = await Wishlist.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
  const ids = items.map((i) => String(i.productId));
  const products = await Product.find({ _id: { $in: ids } })
    .select('title slug variants images ratingAvg ratingCount storeId minPrice foodType attributes')
    .lean();
  const stores = await Store.find({ _id: { $in: products.map((p) => p.storeId) } }).select('name slug').lean();
  const storeMap = new Map(stores.map((s) => [String(s._id), s]));
  const byId = new Map(products.map((p) => [String(p._id), p]));
  // Preserve wishlist order (most recently added first) + attach store name for rich cards.
  const ordered = ids
    .map((id) => byId.get(id))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .map((p) => ({ ...p, store: storeMap.get(String(p.storeId)) ?? null }));
  ok(res, ordered);
}));

wishlistRoutes.post('/', asyncHandler(async (req, res) => {
  const productId = z.string().min(1).parse(req.body.productId);
  await Wishlist.updateOne(
    { userId: req.user!.id, productId },
    { $setOnInsert: { userId: req.user!.id, productId } },
    { upsert: true },
  );
  ok(res, { added: true });
}));

wishlistRoutes.delete('/:productId', asyncHandler(async (req, res) => {
  await Wishlist.deleteOne({ userId: req.user!.id, productId: req.params.productId });
  ok(res, { removed: true });
}));

/**
 * Favourite STORES — a separate model (not a `targetType` discriminator on the same
 * Wishlist collection) because the shape genuinely differs (no productId at all) and
 * the "Wishlist" name/UI is already product-specific; a sibling collection avoids
 * overloading one schema with an optional-everything shape. Same unique-pair,
 * same CRUD mechanics, so it's a near copy-paste of the product wishlist above.
 */
const storeFavouriteSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  },
  { timestamps: true },
);
storeFavouriteSchema.index({ userId: 1, storeId: 1 }, { unique: true });
export type StoreFavouriteDoc = InferSchemaType<typeof storeFavouriteSchema>;
export const StoreFavourite = model('StoreFavourite', storeFavouriteSchema);

export const storeFavouritesRoutes = Router();
storeFavouritesRoutes.use(authenticate);

storeFavouritesRoutes.get('/', asyncHandler(async (req, res) => {
  const favs = await StoreFavourite.find({ userId: req.user!.id }).sort({ createdAt: -1 }).lean();
  const ids = favs.map((f) => String(f.storeId));
  const stores = await Store.find({ _id: { $in: ids }, status: 'approved' })
    .select('name slug description vendorType logo banner ratingAvg ratingCount')
    .lean();
  const byId = new Map(stores.map((s) => [String(s._id), s]));
  // Preserve favourite order (most recently added first); drop stores that are no
  // longer approved rather than showing a dead storefront link.
  const ordered = ids.map((id) => byId.get(id)).filter((s): s is NonNullable<typeof s> => Boolean(s));
  ok(res, ordered);
}));

storeFavouritesRoutes.post('/', asyncHandler(async (req, res) => {
  const storeId = z.string().min(1).parse(req.body.storeId);
  await StoreFavourite.updateOne(
    { userId: req.user!.id, storeId },
    { $setOnInsert: { userId: req.user!.id, storeId } },
    { upsert: true },
  );
  ok(res, { added: true });
}));

storeFavouritesRoutes.delete('/:storeId', asyncHandler(async (req, res) => {
  await StoreFavourite.deleteOne({ userId: req.user!.id, storeId: req.params.storeId });
  ok(res, { removed: true });
}));
