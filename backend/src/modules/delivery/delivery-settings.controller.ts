import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { DeliverySettings, getDeliverySettings } from './delivery-settings.model.js';

const UpdateSchema = z.object({
  assignmentMode: z.enum(['manual', 'auto']).optional(),
  criteriaWeights: z
    .object({
      distance: z.number().min(0).max(1).optional(),
      rating: z.number().min(0).max(1).optional(),
      activeLoad: z.number().min(0).max(1).optional(),
      reliability: z.number().min(0).max(1).optional(),
      vehicleMatch: z.number().min(0).max(1).optional(),
    })
    .optional(),
  offerTimeoutSeconds: z.number().int().min(5).max(600).optional(),
  maxOfferCascadeAttempts: z.number().int().min(1).max(20).optional(),
  maxAssignRadiusKm: z.number().min(0.5).max(100).optional(),
  serviceableCities: z.array(z.string().min(1)).optional(),
  thirdPartyFallbackEnabled: z.boolean().optional(),
});

export const deliverySettingsController = {
  async get(_req: Request, res: Response) {
    ok(res, await getDeliverySettings());
  },
  async update(req: Request, res: Response) {
    const patch = UpdateSchema.parse(req.body);
    const s = await DeliverySettings.findOneAndUpdate({ key: 'delivery' }, patch, { new: true, upsert: true }).lean();
    ok(res, s);
  },
};
