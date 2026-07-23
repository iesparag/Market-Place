import { Router } from 'express';
import { z } from 'zod';
import { RegisterSchema, LoginSchema, RefreshSchema } from '@app/shared';
import { validate } from '../../middleware/validate.js';
import { authenticate } from '../../middleware/authenticate.js';
import { authLimiter } from '../../middleware/rateLimit.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { authController } from './auth.controller.js';

export const authRoutes = Router();

const RegisterVendorSchema = RegisterSchema.extend({
  storeName: z.string().min(2),
  vendorType: z.enum(['food', 'grocery', 'fashion', 'generic', 'integration']).optional(),
  gstin: z.string().optional(),
  pan: z.string().optional(),
  contactPhone: z.string().optional(),
  contactEmail: z.string().email().optional(),
  address: z.object({
    line1: z.string().optional(), city: z.string().optional(),
    state: z.string().optional(), pincode: z.string().optional(),
  }).optional(),
});
const ChangePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: z.string().min(8) });
const VerifyOtpSchema = z.object({ code: z.string().length(6) });
const ForgotSchema = z.object({ email: z.string().email() });
const ResetSchema = z.object({ email: z.string().email(), code: z.string().length(6), newPassword: z.string().min(8) });

authRoutes.post(
  '/register',
  authLimiter,
  validate(RegisterSchema),
  asyncHandler(authController.register),
);
authRoutes.post(
  '/register-vendor',
  authLimiter,
  validate(RegisterVendorSchema),
  asyncHandler(authController.registerVendor),
);
authRoutes.post('/login', authLimiter, validate(LoginSchema), asyncHandler(authController.login));
authRoutes.post('/refresh', validate(RefreshSchema), asyncHandler(authController.refresh));
authRoutes.post('/change-password', authenticate, validate(ChangePasswordSchema), asyncHandler(authController.changePassword));
authRoutes.post('/send-otp', authenticate, authLimiter, asyncHandler(authController.sendOtp));
authRoutes.post('/verify-otp', authenticate, validate(VerifyOtpSchema), asyncHandler(authController.verifyOtp));
authRoutes.post('/forgot-password', authLimiter, validate(ForgotSchema), asyncHandler(authController.forgotPassword));
authRoutes.post('/reset-password', authLimiter, validate(ResetSchema), asyncHandler(authController.resetPassword));
