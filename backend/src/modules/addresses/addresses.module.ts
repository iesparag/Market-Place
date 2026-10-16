import { Router } from 'express';
import { Schema, model, type InferSchemaType } from 'mongoose';
import { z } from 'zod';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok, created } from '../../common/apiResponse.js';
import { AppError } from '../../common/AppError.js';

const addressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    label: { type: String, default: 'Home' },
    recipientName: String,
    line1: { type: String, required: true },
    // Flat/house no., building, floor — kept separate from `line1` (area/street) because
    // Places/current-location resolve `line1`, but a flat number inside a building is
    // never part of a geocoded result; a rider needs both lines, not one merged string.
    line2: String,
    landmark: String,
    city: { type: String, required: true },
    state: String,
    pincode: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
    lat: Number,
    lng: Number,
  },
  { timestamps: true },
);
export type AddressDoc = InferSchemaType<typeof addressSchema>;
export const Address = model('Address', addressSchema);

const AddressInput = z.object({
  label: z.string().optional(),
  recipientName: z.string().optional(),
  line1: z.string().min(1),
  line2: z.string().optional(),
  landmark: z.string().optional(),
  city: z.string().min(1),
  state: z.string().optional(),
  pincode: z.string().optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const addressesRoutes = Router();
addressesRoutes.use(authenticate);

addressesRoutes.get('/', asyncHandler(async (req, res) => {
  ok(res, await Address.find({ userId: req.user!.id }).sort({ isDefault: -1, createdAt: -1 }).lean());
}));

addressesRoutes.post('/', asyncHandler(async (req, res) => {
  const input = AddressInput.parse(req.body);
  if (input.isDefault) await Address.updateMany({ userId: req.user!.id }, { isDefault: false });
  created(res, await Address.create({ ...input, userId: req.user!.id }));
}));

/**
 * Switch which saved address is the "active" one — drives the home feed/nearby-vendor/
 * Now radius via effectiveLocationProvider on the client (providers.dart), not just a
 * cosmetic label. The explicit ask this serves: "I'm at address A but want to order for
 * delivery to address B" — picking B as default re-centers every nearby search on B.
 */
addressesRoutes.patch('/:id/default', asyncHandler(async (req, res) => {
  const address = await Address.findOne({ _id: req.params.id, userId: req.user!.id });
  if (!address) throw AppError.notFound('Address not found');
  await Address.updateMany({ userId: req.user!.id }, { isDefault: false });
  address.isDefault = true;
  await address.save();
  ok(res, address);
}));

addressesRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const r = await Address.deleteOne({ _id: req.params.id, userId: req.user!.id });
  if (r.deletedCount === 0) throw AppError.notFound('Address not found');
  ok(res, { deleted: true });
}));
