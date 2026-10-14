import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { deliverySettingsController } from './delivery-settings.controller.js';

export const deliverySettingsRoutes = Router();

deliverySettingsRoutes.get('/', authenticate, authorize('rider:read'), asyncHandler(deliverySettingsController.get));
deliverySettingsRoutes.patch(
  '/',
  authenticate,
  authorize('delivery:settings'),
  asyncHandler(deliverySettingsController.update),
);
