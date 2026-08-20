import { Router, raw } from 'express';
import { asyncHandler } from '../../common/asyncHandler.js';
import { handlePaymentWebhook } from '../payments/webhooks.controller.js';

/**
 * Gateway callbacks. Mounted in app.ts BEFORE `express.json()` and outside the API
 * rate limiter: the signature is computed over the raw bytes, and a throttled 429
 * would make the gateway retry a payment we already have.
 */
export const webhooksRoutes = Router();

webhooksRoutes.post(
  '/razorpay',
  raw({ type: '*/*', limit: '1mb' }),
  asyncHandler(handlePaymentWebhook),
);

// Same handler, provider-neutral alias — lets the gateway be swapped without
// re-registering a new URL in a dashboard.
webhooksRoutes.post('/payments', raw({ type: '*/*', limit: '1mb' }), asyncHandler(handlePaymentWebhook));
