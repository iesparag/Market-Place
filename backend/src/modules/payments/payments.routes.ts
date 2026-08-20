import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { paymentsController } from './payments.controller.js';

export const paymentsRoutes = Router();

// ── Customer ────────────────────────────────────────────────────────────────
// What to show at checkout (public — the cart renders before login completes).
paymentsRoutes.get('/methods', asyncHandler(paymentsController.methods));

paymentsRoutes.post('/checkout', authenticate, asyncHandler(paymentsController.checkout));
paymentsRoutes.post('/confirm', authenticate, asyncHandler(paymentsController.confirm));
paymentsRoutes.post('/mock-pay', authenticate, asyncHandler(paymentsController.mockPay));
paymentsRoutes.get('/order/:id', authenticate, asyncHandler(paymentsController.status));

// ── Admin / finance ─────────────────────────────────────────────────────────
paymentsRoutes.get('/', authenticate, authorize('payment:read'), asyncHandler(paymentsController.list));
paymentsRoutes.get('/reconcile', authenticate, authorize('payment:read'), asyncHandler(paymentsController.reconcile));
paymentsRoutes.get('/:id', authenticate, authorize('payment:read'), asyncHandler(paymentsController.get));
paymentsRoutes.post('/order/:id/refund', authenticate, authorize('order:refund'), asyncHandler(paymentsController.refund));
paymentsRoutes.post('/events/:id/replay', authenticate, authorize('payment:refund'), asyncHandler(paymentsController.replayEvent));
