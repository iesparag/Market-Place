import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { usersController } from './users.controller.js';

export const usersRoutes = Router();

usersRoutes.get('/me', authenticate, asyncHandler(usersController.me));
usersRoutes.patch('/me', authenticate, asyncHandler(usersController.updateMe));
usersRoutes.get('/me/navigation', authenticate, asyncHandler(usersController.navigation));

// Admin user management
usersRoutes.get('/users', authenticate, authorize('user:read'), asyncHandler(usersController.list));
usersRoutes.patch('/users/:id/role', authenticate, authorize('user:update'), asyncHandler(usersController.setRole));
usersRoutes.get('/users/:id/permissions', authenticate, authorize('role:manage'), asyncHandler(usersController.getPermissions));
usersRoutes.patch('/users/:id/permissions', authenticate, authorize('role:manage'), asyncHandler(usersController.setPermissions));
