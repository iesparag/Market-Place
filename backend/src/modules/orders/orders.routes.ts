import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ordersController } from './orders.controller.js';

export const ordersRoutes = Router();

// Any authenticated user can place an order (customer) and list their own.
ordersRoutes.post('/', authenticate, asyncHandler(ordersController.create));
ordersRoutes.get('/', authenticate, asyncHandler(ordersController.list));
ordersRoutes.get('/:id', authenticate, asyncHandler(ordersController.get));
ordersRoutes.post('/:id/pay', authenticate, asyncHandler(ordersController.pay));
ordersRoutes.post('/:id/cancel', authenticate, asyncHandler(ordersController.cancel));
ordersRoutes.post('/:id/refund', authenticate, authorize('order:refund'), asyncHandler(ordersController.refund));

// Vendor (own store) or super_admin can move status forward.
ordersRoutes.patch(
  '/:id/status',
  authenticate,
  authorize('suborder:update'),
  asyncHandler(ordersController.updateStatus),
);

// Manually re-push the current status (socket + notification) — recovery for missed pushes.
ordersRoutes.post(
  '/:id/resend',
  authenticate,
  authorize('suborder:update'),
  asyncHandler(ordersController.resendStatus),
);
