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
