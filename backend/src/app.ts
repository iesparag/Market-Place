import express, { type Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './middleware/notFound.js';
import { buildApiRouter, healthRoutes } from './loaders/routes.loader.js';
import { UPLOAD_DIR } from './modules/media/media.module.js';

export function createApp(): Express {
  const app = express();

  // Behind Railway/Render/other PaaS proxies the client IP arrives via
  // `X-Forwarded-For`. Trust the first proxy hop so express-rate-limit can key
  // on the real IP (using `true` here is discouraged — it lets clients spoof it).
  app.set('trust proxy', 1);

  // Allow the storefront/admin (different origin) to load uploaded images.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(`/${UPLOAD_DIR}`, express.static(UPLOAD_DIR));
  app.use(
    cors({
      // Allow the configured web/admin origins + any localhost port (Flutter web / local dev).
      // Native apps (Android/iOS) send no Origin header, so they're allowed too.
      origin: (origin, cb) => {
        const allowed = [env.WEB_ORIGIN, env.ADMIN_ORIGIN];
        const isLocalhost = origin != null && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
        cb(null, origin == null || allowed.includes(origin) || isLocalhost);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // Health is unversioned + unrated so probes always work.
  app.use('/', healthRoutes);

  app.use(env.API_PREFIX, apiLimiter, buildApiRouter());

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
