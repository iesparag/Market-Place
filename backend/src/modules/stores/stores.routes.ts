import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { storesController } from './stores.controller.js';

export const storesRoutes = Router();

// Vendor: my store + create
storesRoutes.get('/mine', authenticate, asyncHandler(storesController.mine));
storesRoutes.post('/', authenticate, asyncHandler(storesController.create));

// Edit storefront/business profile (owner or admin — checked in the service).
storesRoutes.patch('/:id', authenticate, asyncHandler(storesController.updateProfile));

// Admin: list + moderate + view one
storesRoutes.get('/', authenticate, authorize('store:read'), asyncHandler(storesController.list));
storesRoutes.get('/:id', authenticate, authorize('store:read'), asyncHandler(storesController.getOne));
storesRoutes.patch(
  '/:id/approve',
  authenticate,
  authorize('store:approve'),
  asyncHandler(storesController.approve),
);
storesRoutes.patch(
  '/:id/status',
  authenticate,
  authorize('store:approve'),
  asyncHandler(storesController.setStatus),
);
