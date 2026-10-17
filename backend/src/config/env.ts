import 'dotenv/config';
import { z } from 'zod';

/** Parse + validate process.env at boot. The app refuses to start on bad config. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  API_PREFIX: z.string().default('/api/v1'),
  MONGO_URI: z.string().default('mongodb://localhost:27017/marketplace'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_ACCESS_SECRET: z.string().min(1).default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-refresh-secret'),
  JWT_ACCESS_TTL: z.coerce.number().default(86400), // 1 day
  JWT_REFRESH_TTL: z.coerce.number().default(15552000), // 180 days
  WEB_ORIGIN: z.string().default('http://localhost:4200'),
  ADMIN_ORIGIN: z.string().default('http://localhost:4300'),
  PUBLIC_URL: z.string().default('http://localhost:4000'),
  // Cloudinary (image upload). Optional — if unset, uploads fall back to local /uploads.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Every uploaded image is resized + re-encoded to WebP before it's stored (local or
  // Cloudinary) — see media.module.ts. MEDIA_WEBP_MAX_BYTES is a target, not a hard wall:
  // quality steps down toward MEDIA_WEBP_QUALITY_MIN trying to hit it, but a very busy
  // image at the quality floor is still accepted rather than rejecting the upload.
  MEDIA_MAX_DIMENSION_PX: z.coerce.number().default(1600),
  MEDIA_WEBP_MAX_BYTES: z.coerce.number().default(180_000), // ~180KB ceiling
  MEDIA_WEBP_QUALITY_START: z.coerce.number().default(80),
  MEDIA_WEBP_QUALITY_MIN: z.coerce.number().default(40),
  // Email. Preferred: RESEND_API_KEY (plain HTTPS — works on hosts like Railway that
  // block outbound SMTP ports 25/465/587). Falls back to SMTP, then to console logging.
  RESEND_API_KEY: z.string().optional(),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(), // e.g. "Marketplace <no-reply@yourdomain.com>"
  // Who gets the error-spike alert email (errorlog.module.ts). Unset = alerting disabled.
  ERROR_ALERT_EMAIL: z.string().optional(),
  // Firebase Cloud Messaging (push notifications for the Flutter app). Optional — stub logs if unset.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(), // paste with literal \n for newlines
  // ── Payments (India: Razorpay — UPI / cards / netbanking / wallets) ─────────
  // Leave the keys blank in dev: the provider auto-falls back to a keyless mock
  // gateway so checkout still works end-to-end locally. See docs/05-PAYMENTS.md.
  PAYMENT_PROVIDER: z.enum(['auto', 'razorpay', 'mock']).default('auto'),
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  PAYMENT_CURRENCY: z.enum(['INR']).default('INR'),
  /** Company/brand name shown on the Razorpay checkout sheet. */
  PAYMENT_BRAND_NAME: z.string().default('Marketplace'),
  /** Logo shown on the checkout sheet (absolute https URL, optional). */
  PAYMENT_BRAND_LOGO: z.string().default(''),
  // Search engine: 'mongo' (default, works on any MongoDB, no setup) or 'atlas' (Atlas Search — better relevance/typo-tolerance).
  SEARCH_ENGINE: z.enum(['mongo', 'atlas']).default('mongo'),
  // AI customer support (docs/10-SUPPORT-AI.md). Optional — if OPENAI_API_KEY is unset the
  // support bot runs on a deterministic stub, so everything boots keyless in dev.
  OPENAI_API_KEY: z.string().optional(),
  AI_CHAT_MODEL: z.string().default('gpt-4o-mini'),
  AI_EMBED_MODEL: z.string().default('text-embedding-3-small'),
  // Vector store for RAG retrieval: 'mongo' (in-app cosine, any MongoDB — dev default) or
  // 'atlas' ($vectorSearch — needs an Atlas vector index on kb_chunks.embedding).
  VECTOR_ENGINE: z.enum(['mongo', 'atlas']).default('mongo'),
  SUPPORT_RATE_PER_MIN: z.coerce.number().default(20), // per-user support message rate limit
  // Mobile app (Flutter): minimum supported version + where to send users to update.
  APP_MIN_VERSION: z.string().default('1.0.0'),
  APP_LATEST_VERSION: z.string().default('1.0.0'),
  APP_UPDATE_URL: z.string().default(''), // Play Store / APK / Drive link
  APP_UPDATE_MESSAGE: z.string().default('A new version is available. Please update to continue.'),
  // Address search / geocoding. auto (default): LocationIQ when a key is set, else
  // Nominatim. Nominatim silently drops requests from cloud/datacenter IPs (Railway,
  // AWS, etc.) as anti-abuse policy — it works from a laptop but hangs/fails from a
  // deployed server, so production needs a LocationIQ key. Sign up free (no card) at
  // locationiq.com → 5,000 req/day → set LOCATIONIQ_API_KEY. Proxied + Redis-cached
  // server-side either way (never called directly from a client).
  GEOCODE_PROVIDER: z.enum(['auto', 'nominatim', 'locationiq']).default('auto'),
  GEOCODE_USER_AGENT: z.string().default('MarketplaceApp/1.0 (ops@yourdomain.example)'),
  GEOCODE_CACHE_TTL_SECONDS: z.coerce.number().default(2592000), // 30 days — addresses rarely move
  LOCATIONIQ_API_KEY: z.string().optional(),
  // ── Google Places (address autocomplete + place details) ───────────────────
  // Backend-proxied only — the key NEVER goes to any client (Flutter/Angular). This is
  // both the secure answer and the only way the Redis cache below actually works (a
  // client-embedded key would let the client call Google directly and bypass it).
  // Unset: autocomplete/details return empty/null everywhere, keyless-safe like every
  // other provider in this file.
  GOOGLE_PLACES_API_KEY: z.string().optional(),
  PLACES_COUNTRY_RESTRICTION: z.string().default('in'),
  PLACES_AUTOCOMPLETE_CACHE_TTL_SECONDS: z.coerce.number().default(86400), // 1 day — input text → predictions
  PLACES_DETAILS_CACHE_TTL_SECONDS: z.coerce.number().default(7776000), // 90 days — place_id → lat/lng rarely changes
  // ── Nearby-vendor search + delivery ETA ─────────────────────────────────────
  SERVICEABLE_RADIUS_KM: z.coerce.number().default(10),
  // Tighter than SERVICEABLE_RADIUS_KM — the "Now" feed is instant/same-visit delivery,
  // so it only shows vendors close enough for that to be realistic, not just "deliverable."
  NOW_RADIUS_KM: z.coerce.number().default(5),
  // Self-hosted OSRM for the live rider→destination polyline (free, no per-request
  // billing — deliberately NOT the public router.project-osrm.org demo server, whose
  // own usage policy says it isn't for production traffic). See docker/osrm/README.md.
  // Unset: /routing returns null everywhere, customer_app falls back to a plain marker.
  OSRM_BASE_URL: z.string().optional(),
  ROUTE_CACHE_TTL_SECONDS: z.coerce.number().default(15),
  // Sanity cap on the OSRM route distance used for rider payouts — every real delivery
  // is already bounded by NOW_RADIUS_KM/SERVICEABLE_RADIUS_KM at checkout time, so this
  // only guards against a bad/looping route result, never a genuine long-haul delivery.
  RIDER_PAYOUT_MAX_DISTANCE_KM: z.coerce.number().default(30),
  DELIVERY_BASE_MINUTES: z.coerce.number().default(12), // prep + dispatch overhead
  DELIVERY_AVG_SPEED_KMH: z.coerce.number().default(18), // conservative urban avg incl. traffic/stops
  // Third-party logistics (orders outside our own rider-covered cities). Keyless mock in
  // dev, same auto-fallback shape as PAYMENT_PROVIDER — see providers/logistics/index.ts.
  LOGISTICS_PROVIDER: z.enum(['mock']).default('mock'),
  // WhatsApp Business Platform (Meta Cloud API) — cart-recovery / promo campaigns.
  // Logs instead of sending if unset, same keyless-safe shape as every other provider
  // here. Get a free trial token + test number at developers.facebook.com → an App →
  // add the WhatsApp product. See providers/whatsapp/index.ts.
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(), // needed only to create/list templates
  // Name of the Meta-approved template the abandoned-cart sweep sends automatically.
  // Unset = sweep stays push-only (safe default — a template name here that isn't actually
  // 'approved' in WhatsAppTemplate is a silent no-op, never a crash; see cart-reminder-sweep.ts).
  WHATSAPP_CART_REMINDER_TEMPLATE: z.string().optional(),
  // Name of the Meta-approved template deliveryTasksService.createForOrder() sends to a
  // vendor's contactPhone when a new order comes in. Same off-by-default contract as
  // WHATSAPP_CART_REMINDER_TEMPLATE — unset = vendors only get the in-portal notify.
  WHATSAPP_NEW_ORDER_TEMPLATE: z.string().optional(),
  LOGISTICS_WEBHOOK_SECRET: z.string().default('dev-logistics-webhook-secret'),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment config:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
