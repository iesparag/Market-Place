import { Redis } from 'ioredis';
import { env } from './env.js';

/** Lazy singleton; used for cache, BullMQ, and the socket.io adapter. */
let client: Redis | null = null;

export function getRedis(): Redis {
  if (!client) {
    client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
  }
  return client;
}
