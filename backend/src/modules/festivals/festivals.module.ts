import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';

/**
 * Admin-managed festival calendar — Diwali/Holi/Eid/etc. Each entry is a date window
 * + a greeting + a Lottie animation URL; the customer app checks `GET /festivals/active`
 * on launch and shows a one-time greeting when one is live. New festivals need no app
 * release — just a row here, same spirit as `banners`/`appconfig`.
 */
const festivalSchema = new Schema(
  {
    name: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    greetingTitle: { type: String, required: true },
    greetingMessage: { type: String, default: '' },
    /** URL to a hosted Lottie JSON (e.g. a free animation from lottiefiles.com). */
    lottieUrl: { type: String, required: true },
    /** Optional static banner image for the home screen while the festival is live. */
    bannerImageUrl: String,
    /** Optional accent-color override (hex) applied while the festival is live. */
    themeColor: String,
    /** Highest priority wins when two festivals' date windows overlap. */
    priority: { type: Number, default: 0 },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);
export type FestivalDoc = InferSchemaType<typeof festivalSchema>;
export const Festival = model('Festival', festivalSchema);

const CreateSchema = z.object({
  name: z.string().min(1),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  greetingTitle: z.string().min(1),
  greetingMessage: z.string().optional(),
  lottieUrl: z.string().url(),
  bannerImageUrl: z.string().url().optional(),
  themeColor: z.string().optional(),
  priority: z.number().int().optional(),
});

export const festivalsRoutes = Router();

// Public: the single best-matching festival live right now (or null). Deliberately one
// object, not a list — the client shows exactly one greeting, no stacking logic needed.
festivalsRoutes.get(
  '/active',
  asyncHandler(async (_req, res) => {
    const now = new Date();
    const festival = await Festival.findOne({ active: true, startDate: { $lte: now }, endDate: { $gte: now } })
      .sort({ priority: -1, startDate: -1 })
      .lean();
    ok(res, festival ?? null);
  }),
);

// Admin: every festival, regardless of date window or active flag.
festivalsRoutes.get('/all', authenticate, authorize('banner:manage'), asyncHandler(async (_req, res) => {
  ok(res, await Festival.find().sort({ startDate: -1 }).lean());
}));

festivalsRoutes.post('/', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  const input = CreateSchema.parse(req.body);
  if (input.endDate < input.startDate) throw AppError.badRequest('BAD_RANGE', 'End date must be after start date');
  created(res, await Festival.create(input));
}));

festivalsRoutes.patch('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  const patch = CreateSchema.partial().extend({ active: z.boolean().optional() }).parse(req.body);
  const doc = await Festival.findByIdAndUpdate(req.params.id, patch, { new: true }).lean();
  if (!doc) throw AppError.notFound('Festival not found');
  ok(res, doc);
}));

festivalsRoutes.delete('/:id', authenticate, authorize('banner:manage'), asyncHandler(async (req, res) => {
  await Festival.deleteOne({ _id: req.params.id });
  ok(res, { deleted: true });
}));
