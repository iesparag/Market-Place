import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { deliveryTasksController } from './delivery-tasks.controller.js';
import { deliverySettingsRoutes } from './delivery-settings.routes.js';

export const deliveryTasksRoutes = Router();

deliveryTasksRoutes.use('/settings', deliverySettingsRoutes);

deliveryTasksRoutes.get('/', authenticate, authorize('rider:read'), asyncHandler(deliveryTasksController.list));
deliveryTasksRoutes.get('/:id', authenticate, authorize('rider:read'), asyncHandler(deliveryTasksController.get));
deliveryTasksRoutes.post(
  '/:id/assign',
  authenticate,
  authorize('delivery:assign'),
  asyncHandler(deliveryTasksController.assign),
);
deliveryTasksRoutes.post(
  '/:id/unassign',
  authenticate,
  authorize('delivery:assign'),
  asyncHandler(deliveryTasksController.unassign),
);
deliveryTasksRoutes.patch(
  '/:id/status',
  authenticate,
  authorize('suborder:update'),
  asyncHandler(deliveryTasksController.updateStatus),
);
