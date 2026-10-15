import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { routingController } from './routing.controller.js';

export const routingRoutes = Router();
routingRoutes.use(authenticate);

routingRoutes.get('/', asyncHandler(routingController.route));
