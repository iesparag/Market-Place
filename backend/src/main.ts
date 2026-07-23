import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDb } from './config/db.js';
import { createApp } from './app.js';
import { createHttpServer } from './server.js';

async function bootstrap(): Promise<void> {
  // Connect DB but don't hard-crash in dev if Mongo isn't up yet — /health will report it.
  try {
    await connectDb();
  } catch (err) {
    logger.warn({ err }, 'MongoDB not reachable at boot; continuing (check /health)');
  }

  const app = createApp();
  const server = createHttpServer(app);

  server.listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}${env.API_PREFIX}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

void bootstrap();
