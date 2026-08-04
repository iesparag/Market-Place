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
  // Email (SMTP — e.g. Gmail). Optional — if unset, emails are logged to console.
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(), // e.g. "Marketplace <no-reply@yourdomain.com>"
  // Firebase Cloud Messaging (push notifications for the Flutter app). Optional — stub logs if unset.
  FIREBASE_PROJECT_ID: z.string().optional(),
  FIREBASE_CLIENT_EMAIL: z.string().optional(),
  FIREBASE_PRIVATE_KEY: z.string().optional(), // paste with literal \n for newlines
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
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment config:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
