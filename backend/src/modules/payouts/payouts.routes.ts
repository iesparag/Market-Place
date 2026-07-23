import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { payoutsController } from './payouts.controller.js';

export const payoutsRoutes = Router();

// Vendor wallet + history
payoutsRoutes.get('/wallet', authenticate, authorize('wallet:read'), asyncHandler(payoutsController.wallet));
payoutsRoutes.get('/', authenticate, authorize('payout:read'), asyncHandler(payoutsController.history));

// Admin finance
payoutsRoutes.get('/balances', authenticate, authorize('ledger:read'), asyncHandler(payoutsController.balances));
payoutsRoutes.post('/release', authenticate, authorize('payout:release'), asyncHandler(payoutsController.release));
