import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';

const bannerSchema = new Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: '' },
    imageUrl: String,
    ctaText: { type: String, default: 'Shop now' },
    link: { type: String, default: '/catalog' }, // route or ?query
    bg: { type: String, default: '#ea580c' }, // fallback background when no image
    active: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);
export type BannerDoc = InferSchemaType<typeof bannerSchema>;
export const Banner = model('Banner', bannerSchema);

const CreateSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  imageUrl: z.string().optional(),
  ctaText: z.string().optional(),
  link: z.string().optional(),
  bg: z.string().optional(),
});

export const bannersRoutes = Router();

// Public: only ACTIVE banners, ordered (inactive ones are simply skipped → the rest move up).
bannersRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    ok(res, await Banner.find({ active: true }).sort({ order: 1, createdAt: 1 }).lean());
  }),
);

// Admin: all banners (incl. inactive)
bannersRoutes.get('/all', authenticate, authorize('banner:manage'), asyncHandler(async (_req, res) => {
  ok(res, await Banner.find().sort({ order: 1, createdAt: 1 }).lean());
}));

bannersRoutes.post('/', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  const input = CreateSchema.parse(req.body);
  const order = await Banner.countDocuments();
  created(res, await Banner.create({ ...input, order }));
}));

bannersRoutes.patch('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  const patch = CreateSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const doc = await Banner.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
  if (!doc) throw AppError.notFound('Banner not found');
  ok(res, doc);
}));

// Reorder: client sends the full ordered list of ids → order = index.
bannersRoutes.post('/reorder', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  const ids = z.array(z.string()).parse(req.body.ids);
  await Promise.all(ids.map((id, i) => Banner.updateOne({ _id: id }, { order: i })));
  ok(res, { reordered: true });
}));

bannersRoutes.delete('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  await Banner.deleteOne({ _id: req.params.id });
  ok(res, { deleted: true });
}));
