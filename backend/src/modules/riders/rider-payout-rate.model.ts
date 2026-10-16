import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';

/**
 * Per-city ₹/km rate for rider payouts — set only for the cities we actually run "Now"
 * (instant-delivery) in, by design: a city with no rate configured here means no
 * payout gets computed for a delivery there (see deliveryTasksService.maybeComputePayout)
 * rather than falling back to some generic nationwide number a Delhi-to-Mumbai delivery
 * could absurdly inflate. Admin explicitly opts each serviceable city in, one by one.
 */
const rateSchema = new Schema(
  {
    city: { type: String, required: true, unique: true, lowercase: true, trim: true },
    ratePerKm: { type: Number, required: true }, // paise per km — same minor-unit convention as every other money field
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);
export type RiderPayoutRateDoc = InferSchemaType<typeof rateSchema>;
export const RiderPayoutRate = model('RiderPayoutRate', rateSchema);

const RateInput = z.object({
  city: z.string().min(1),
  ratePerKm: z.number().min(0),
  active: z.boolean().optional(),
});

export const riderPayoutRatesRoutes = Router();
riderPayoutRatesRoutes.use(authenticate, authorize('rider:manage'));

riderPayoutRatesRoutes.get('/', asyncHandler(async (_req, res) => {
  ok(res, await RiderPayoutRate.find().sort({ city: 1 }).lean());
}));

riderPayoutRatesRoutes.post('/', asyncHandler(async (req, res) => {
  const input = RateInput.parse(req.body);
  const existing = await RiderPayoutRate.findOne({ city: input.city.toLowerCase().trim() });
  if (existing) throw AppError.conflict('A rate for this city already exists — edit it instead.');
  created(res, await RiderPayoutRate.create(input));
}));

riderPayoutRatesRoutes.patch('/:id', asyncHandler(async (req, res) => {
  const input = RateInput.partial().parse(req.body);
  const rate = await RiderPayoutRate.findByIdAndUpdate(req.params.id, input, { new: true });
  if (!rate) throw AppError.notFound('Rate not found');
  ok(res, rate);
}));

riderPayoutRatesRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const r = await RiderPayoutRate.deleteOne({ _id: req.params.id });
  if (r.deletedCount === 0) throw AppError.notFound('Rate not found');
  ok(res, { deleted: true });
}));
