import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { authenticateRider } from '../../middleware/authenticateRider.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ridersController } from './riders.controller.js';

export const ridersRoutes = Router();

// Rider login is public (not authenticate/authenticateRider) — riders are onboarded by
// an admin/vendor (see POST / below), never self-registered.
ridersRoutes.post('/auth/login', authLimiter, asyncHandler(ridersController.login));

// Admin/vendor manage the rider roster — portal-controlled, matching the delivery flag.
ridersRoutes.post('/', authenticate, authorize('rider:manage'), asyncHandler(ridersController.create));
ridersRoutes.get('/', authenticate, authorize('rider:read'), asyncHandler(ridersController.list));
ridersRoutes.patch('/:id', authenticate, authorize('rider:manage'), asyncHandler(ridersController.update));

// Rider self-service — own JWT scope, never the marketplace `authenticate`.
ridersRoutes.get('/me', authenticateRider, asyncHandler(ridersController.me));
ridersRoutes.patch('/me/status', authenticateRider, asyncHandler(ridersController.setStatus));
ridersRoutes.post('/me/location', authenticateRider, asyncHandler(ridersController.updateLocation));
ridersRoutes.get('/me/tasks', authenticateRider, asyncHandler(ridersController.myTasks));
ridersRoutes.patch('/me/tasks/:id/status', authenticateRider, asyncHandler(ridersController.updateTaskStatus));

// Automatic-assignment offers — poll-based + a push nudge so a rider doesn't have to
// have the app open to notice a new job (see auto-assign.service.ts / rider-push.ts).
ridersRoutes.get('/me/offers', authenticateRider, asyncHandler(ridersController.myOffers));
ridersRoutes.post('/me/offers/:id/accept', authenticateRider, asyncHandler(ridersController.acceptOffer));
ridersRoutes.post('/me/offers/:id/decline', authenticateRider, asyncHandler(ridersController.declineOffer));

// Rider app registers its FCM device token for push (assignment/offer/unassign alerts).
ridersRoutes.post('/me/register-device', authenticateRider, asyncHandler(ridersController.registerDevice));
