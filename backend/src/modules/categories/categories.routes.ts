import { Router } from 'express';
import { CreateCategorySchema, UpdateCategorySchema } from '@app/shared';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { validate } from '../../middleware/validate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { categoriesController } from './categories.controller.js';

export const categoriesRoutes = Router();

// Public read
categoriesRoutes.get('/', asyncHandler(categoriesController.list));

// Managed by super_admin / permitted admin
categoriesRoutes.post(
  '/',
  authenticate,
  authorize('category:manage'),
  validate(CreateCategorySchema),
  asyncHandler(categoriesController.create),
);
categoriesRoutes.patch(
  '/:id',
  authenticate,
  authorize('category:manage'),
  validate(UpdateCategorySchema),
  asyncHandler(categoriesController.update),
);
categoriesRoutes.delete(
  '/:id',
  authenticate,
  authorize('category:manage'),
  asyncHandler(categoriesController.remove),
);
