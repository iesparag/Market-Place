import { Router } from 'express';
import { CreateProductSchema, UpdateProductSchema } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { scopeToStore } from '../../middleware/scopeToStore.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { productsController } from './products.controller.js';

export const productsRoutes = Router();

productsRoutes.get(
  '/',
  authenticate,
  authorize('product:read'),
  scopeToStore,
  asyncHandler(productsController.list),
);
// Static path must precede '/:id' so it isn't captured as an id.
productsRoutes.get(
  '/low-stock',
  authenticate,
  authorize('product:read'),
  scopeToStore,
  asyncHandler(productsController.lowStock),
);
productsRoutes.post(
  '/',
  authenticate,
  authorize('product:create'),
  scopeToStore,
  validate(CreateProductSchema),
  asyncHandler(productsController.create),
);
productsRoutes.get(
  '/:id',
  authenticate,
  authorize('product:read'),
  scopeToStore,
  asyncHandler(productsController.getOne),
);
productsRoutes.patch(
  '/:id',
  authenticate,
  authorize('product:update'),
  scopeToStore,
  validate(UpdateProductSchema),
  asyncHandler(productsController.update),
);
productsRoutes.patch(
  '/:id/stock',
  authenticate,
  authorize('product:update'),
  scopeToStore,
  asyncHandler(productsController.adjustStock),
);
productsRoutes.patch(
  '/:id/publish',
  authenticate,
  authorize('product:update'),
  scopeToStore,
  asyncHandler(productsController.setPublished),
);
productsRoutes.delete(
  '/:id',
  authenticate,
  authorize('product:delete'),
  scopeToStore,
  asyncHandler(productsController.remove),
);
