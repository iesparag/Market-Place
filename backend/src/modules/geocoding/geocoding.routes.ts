import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { geocodeLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { geocodingController } from './geocoding.controller.js';

export const geocodingRoutes = Router();
geocodingRoutes.use(authenticate, geocodeLimiter);

geocodingRoutes.get('/search', asyncHandler(geocodingController.search));
geocodingRoutes.get('/reverse', asyncHandler(geocodingController.reverse));
