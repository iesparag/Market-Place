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
    line1: { type: String, required: true },
    city: { type: String, required: true },
    pincode: String,
    phone: String,
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: true },
);
export type AddressDoc = InferSchemaType<typeof addressSchema>;
export const Address = model('Address', addressSchema);

const AddressInput = z.object({
  label: z.string().optional(),
  line1: z.string().min(1),
  city: z.string().min(1),
  pincode: z.string().optional(),
  phone: z.string().optional(),
  isDefault: z.boolean().optional(),
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

addressesRoutes.delete('/:id', asyncHandler(async (req, res) => {
  const r = await Address.deleteOne({ _id: req.params.id, userId: req.user!.id });
  if (r.deletedCount === 0) throw AppError.notFound('Address not found');
  ok(res, { deleted: true });
}));
