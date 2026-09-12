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
// Admin: confirm the payout account against the KYC docs.
storesRoutes.patch(
  '/:id/bank-verify',
  authenticate,
  authorize('payout:release'),
  asyncHandler(storesController.verifyBank),
);
// Permission depends on the requested status (approved/rejected need `store:approve`,
// suspended needs `store:suspend`) — checked inside the controller, not here.
storesRoutes.patch('/:id/status', authenticate, asyncHandler(storesController.setStatus));

// Admin-only, irreversible: hard-deletes a store that has never had an order (see
// stores.service.ts). Anything with order/ledger history must be suspended instead.
storesRoutes.delete('/:id', authenticate, authorize('store:delete'), asyncHandler(storesController.remove));
