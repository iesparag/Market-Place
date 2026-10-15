import { Redis } from 'ioredis';
import { env } from './env.js';

/** Lazy singleton; used for cache, BullMQ, and the socket.io adapter. */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    // `maxRetriesPerRequest: null` (BullMQ's recommended setting) means a command
    // retries forever until Redis is reachable — fine for a queue worker, fatal for a
    // request-path cache lookup: if REDIS_URL is unset/wrong in an environment, every
    // request that touches Redis (e.g. geocode search) hangs forever instead of
    // failing. BullMQ isn't actually wired to any worker yet (see jobs/queues.ts), so
    // nothing here depends on unlimited retries — bound it so a bad connection fails
    // fast and callers (geocoding.service.ts) can fall back to a cache-miss.
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 5000, lazyConnect: true });
  }
  return client;
}
