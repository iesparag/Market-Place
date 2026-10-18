import type { Request, Response } from 'express';
import { z } from 'zod';
import { ok } from '../../common/apiResponse.js';
import { Settings, getSettings } from './settings.model.js';

const UpdateSchema = z.object({
  commissionPercent: z.number().min(0).max(90).optional(),
  taxPercent: z.number().min(0).max(50).optional(),
  deliveryFee: z.number().int().min(0).optional(),
  freeDeliveryAbove: z.number().int().min(0).optional(),
  localDeliveryBaseFee: z.number().int().min(0).optional(),
  localDeliveryBaseKm: z.number().min(0).optional(),
  localDeliveryPerKmFee: z.number().int().min(0).optional(),
  thirdPartyDeliveryFee: z.number().int().min(0).optional(),
  payoutHoldDays: z.number().int().min(0).optional(),
  codEnabled: z.boolean().optional(),
  codMaxOrderValue: z.number().int().min(0).optional(),
  onlinePaymentEnabled: z.boolean().optional(),
  paymentExpiryMinutes: z.number().int().min(0).max(1440).optional(),
  loyaltyEarnDivisor: z.number().int().min(1).optional(),
  loyaltyPointValuePaise: z.number().int().min(1).optional(),
  loyaltyMaxRedeemShare: z.number().min(0).max(1).optional(),
  referralRewardPoints: z.number().int().min(0).optional(),
  features: z
    .object({
      couponsEnabled: z.boolean(),
      loyaltyEnabled: z.boolean(),
      referralEnabled: z.boolean(),
      frequentlyBoughtTogetherEnabled: z.boolean(),
      wishlistPriceDropAlertsEnabled: z.boolean(),
      recentlyViewedEnabled: z.boolean(),
      checkoutAdBannerEnabled: z.boolean(),
    })
    .partial()
    .optional(),
});

export const settingsController = {
  async get(_req: Request, res: Response) {
    ok(res, await getSettings());
  },
  async update(req: Request, res: Response) {
    const patch = UpdateSchema.parse(req.body);
    const s = await Settings.findOneAndUpdate({ key: 'platform' }, patch, { new: true, upsert: true }).lean();
    ok(res, s);
  },
};
