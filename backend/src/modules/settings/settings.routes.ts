import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { settingsController } from './settings.controller.js';

export const settingsRoutes = Router();

settingsRoutes.get('/', authenticate, asyncHandler(settingsController.get));
settingsRoutes.patch('/', authenticate, authorize('settings:manage'), asyncHandler(settingsController.update));
