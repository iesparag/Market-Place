import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate.js';
import { authorize } from '../../middleware/authorize.js';
import { asyncHandler } from '../../common/asyncHandler.js';
import { ok } from '../../common/apiResponse.js';
import { env } from '../../config/env.js';

type Status = 'live' | 'fallback' | 'not_configured';
interface IntegrationInfo {
  key: string;
  name: string;
  category: string;
  status: Status;
  detail: string;
}

/**
 * `/integrations` — read-only status of every third-party service this backend can
 * talk to, each one driven by optional env vars with a safe fallback (mock gateway,
 * console logging, a free-but-unreliable geocoder, …) so the app runs keyless in dev.
 * This page exists to answer "what's actually live right now" without grepping .env —
 * it reports configuration presence, not a live connectivity probe (hitting Razorpay/
 * WhatsApp/etc. on every page load would be slow and, for some, not free).
 */
export const integrationsRoutes = Router();
integrationsRoutes.use(authenticate, authorize('integration:manage'));

integrationsRoutes.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows: IntegrationInfo[] = [
      {
        key: 'payments',
        name: 'Razorpay',
        category: 'Payments',
        status: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'live' : 'fallback',
        detail: env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET ? 'Live gateway' : 'Keyless mock gateway — set RAZORPAY_KEY_ID/SECRET',
      },
      {
        key: 'email',
        name: env.RESEND_API_KEY ? 'Resend' : env.SMTP_HOST ? 'SMTP' : 'Console (dev)',
        category: 'Email',
        status: env.RESEND_API_KEY || env.SMTP_HOST ? 'live' : 'fallback',
        detail: env.RESEND_API_KEY
          ? 'Sending via Resend'
          : env.SMTP_HOST
            ? `Sending via SMTP (${env.SMTP_HOST})`
            : 'Not configured — emails are logged, not sent',
      },
      {
        key: 'push',
        name: 'Firebase Cloud Messaging',
        category: 'Notifications',
        status: env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY ? 'live' : 'not_configured',
        detail:
          env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY
            ? 'Push notifications active'
            : 'Not configured — push is a no-op',
      },
      {
        key: 'whatsapp',
        name: 'WhatsApp Business API',
        category: 'Notifications',
        status: env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID ? 'live' : 'not_configured',
        detail:
          env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID
            ? 'Sending WhatsApp templates'
            : 'Not configured — messages are logged only',
      },
      {
        key: 'media',
        name: 'Cloudinary',
        category: 'Media',
        status: env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY ? 'live' : 'fallback',
        detail: env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY ? 'Uploads go to Cloudinary' : 'Falling back to local /uploads storage',
      },
      {
        key: 'geocoding',
        name: env.LOCATIONIQ_API_KEY ? 'LocationIQ' : 'Nominatim (free)',
        category: 'Maps & location',
        status: env.LOCATIONIQ_API_KEY ? 'live' : 'fallback',
        detail: env.LOCATIONIQ_API_KEY ? 'LocationIQ geocoding' : 'Free Nominatim — unreliable from cloud/datacenter IPs',
      },
      {
        key: 'places',
        name: 'Google Places',
        category: 'Maps & location',
        status: env.GOOGLE_PLACES_API_KEY ? 'live' : 'not_configured',
        detail: env.GOOGLE_PLACES_API_KEY ? 'Address autocomplete active' : 'Not configured — autocomplete/details return empty',
      },
      {
        key: 'routing',
        name: 'OSRM',
        category: 'Maps & location',
        status: env.OSRM_BASE_URL ? 'live' : 'not_configured',
        detail: env.OSRM_BASE_URL ? `Routing via ${env.OSRM_BASE_URL}` : 'Not configured — route() returns null everywhere',
      },
      {
        key: 'ai',
        name: 'OpenAI',
        category: 'Support AI',
        status: env.OPENAI_API_KEY ? 'live' : 'fallback',
        detail: env.OPENAI_API_KEY ? 'Live classification/drafting' : 'Mock provider — canned intents/replies',
      },
    ];
    ok(res, rows);
  }),
);
