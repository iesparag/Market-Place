import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';
import { Product } from '../products/product.model.js';
import { Order } from '../orders/order.model.js';
import { User } from '../auth/user.model.js';

const reviewSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
    customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    customerName: String,
    rating: { type: Number, min: 1, max: 5, required: true },
    text: { type: String, default: '' },
    verified: { type: Boolean, default: false }, // customer actually purchased
    status: { type: String, enum: ['visible', 'hidden'], default: 'visible' },
  },
  { timestamps: true },
);
reviewSchema.index({ productId: 1, customerId: 1 }, { unique: true }); // one review per product per user
export type ReviewDoc = InferSchemaType<typeof reviewSchema>;
export const Review = model('Review', reviewSchema);

const CreateReviewSchema = z.object({
  productId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  text: z.string().max(1000).optional(),
});

async function recomputeRating(productId: string): Promise<void> {
  const pid = (await Product.findById(productId).select('_id').lean())?._id;
  const rows = await Review.aggregate<{ avg: number; count: number }>([
    { $match: { productId: pid, status: 'visible' } },
    { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  const r = rows[0];
  await Product.updateOne(
    { _id: productId },
    { ratingAvg: Math.round((r?.avg ?? 0) * 10) / 10, ratingCount: r?.count ?? 0 },
  );
}

export const reviewsRoutes = Router();

// Public: VISIBLE reviews for a product
reviewsRoutes.get(
  '/product/:productId',
  asyncHandler(async (req, res) => {
    ok(res, await Review.find({ productId: req.params.productId, status: 'visible' }).sort({ createdAt: -1 }).lean());
  }),
);

// Can the signed-in user review this product? (bought it + not-yet-reviewed status)
reviewsRoutes.get(
  '/can-review/:productId',
  authenticate,
  asyncHandler(async (req, res) => {
    const purchased = await Order.exists({
      customerId: req.user!.id,
      status: { $in: ['paid', 'fulfilled'] },
      'items.productId': req.params.productId,
    });
    const existing = await Review.findOne({ productId: req.params.productId, customerId: req.user!.id }).select('rating text').lean();
    ok(res, { canReview: !!purchased, mine: existing ?? null });
  }),
);

// Customer writes a review (one per product; upserts). Only verified buyers.
reviewsRoutes.post(
  '/',
  authenticate,
  asyncHandler(async (req, res) => {
    const input = CreateReviewSchema.parse(req.body);
    const product = await Product.findById(input.productId).select('storeId').lean();
    if (!product) throw AppError.notFound('Product not found');
    const purchased = await Order.exists({
      customerId: req.user!.id,
      status: { $in: ['paid', 'fulfilled'] },
      'items.productId': input.productId,
    });
    // Only customers who actually bought the product may review it.
    if (!purchased) throw AppError.forbidden('Only verified buyers can review this product');
    const user = await User.findById(req.user!.id).select('name').lean();
    const doc = await Review.findOneAndUpdate(
      { productId: input.productId, customerId: req.user!.id },
      {
        productId: input.productId,
        storeId: product.storeId,
        customerId: req.user!.id,
        customerName: user?.name,
        rating: input.rating,
        text: input.text ?? '',
        verified: !!purchased,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    await recomputeRating(input.productId);
    created(res, doc);
  }),
);

// Admin: list all reviews for moderation
reviewsRoutes.get(
  '/',
  authenticate,
  authorize('review:read'),
  asyncHandler(async (_req, res) => {
    const reviews = await Review.find().sort({ createdAt: -1 }).limit(200).lean();
    const products = await Product.find({ _id: { $in: reviews.map((r) => r.productId) } }).select('title').lean();
    const titleMap = new Map(products.map((p) => [String(p._id), p.title]));
    ok(res, reviews.map((r) => ({ ...r, productTitle: titleMap.get(String(r.productId)) ?? '—' })));
  }),
);

// Admin: hide / show a review
reviewsRoutes.patch(
  '/:id',
  authenticate,
  authorize('review:moderate'),
  asyncHandler(async (req, res) => {
    const status = z.enum(['visible', 'hidden']).parse(req.body.status);
    const doc = await Review.findByIdAndUpdate(req.params.id, { status }, { new: true }).lean();
    if (!doc) throw AppError.notFound('Review not found');
    await recomputeRating(String(doc.productId));
    ok(res, doc);
  }),
);
