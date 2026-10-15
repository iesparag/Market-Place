import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { placesLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { placesController } from './places.controller.js';

export const placesRoutes = Router();
placesRoutes.use(authenticate, placesLimiter);

placesRoutes.get('/autocomplete', asyncHandler(placesController.autocomplete));
placesRoutes.get('/details', asyncHandler(placesController.details));
