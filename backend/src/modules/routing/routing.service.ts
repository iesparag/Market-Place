import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getRedis } from '../../config/redis.js';
import { routingProvider } from '../../providers/routing/index.js';
import type { RouteResult } from '../../providers/routing/types.js';

type Point = { lat: number; lng: number };

/** Round the rider's position to a coarse grid (~110m at 3 decimal places) so repeated
 * route requests while a rider moves a few metres between polls hit the same cache key
 * — the destination is rounded less aggressively since it never moves mid-delivery. */
function routeKey(from: Point, to: Point): string {
  const f = `${from.lat.toFixed(3)}:${from.lng.toFixed(3)}`;
  const t = `${to.lat.toFixed(4)}:${to.lng.toFixed(4)}`;
  return `route:${f}:${t}`;
}

async function safeGet(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key);
  } catch (err) {
    logger.warn({ err, key }, 'route cache read failed — continuing without cache');
    return null;
  }
}
async function safeSet(key: string, value: string): Promise<void> {
  try {
    await getRedis().set(key, value, 'EX', env.ROUTE_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key }, 'route cache write failed — continuing without cache');
  }
}

export const routingService = {
  /** Short-TTL cached in front of OSRM — this is what keeps a customer's screen polling
   * the route every few seconds from hammering the OSRM container on every single call;
   * the rider's actual position rarely crosses into a new ~110m grid cell between polls. */
  async route(from: Point, to: Point): Promise<RouteResult | null> {
    const key = routeKey(from, to);
    const cached = await safeGet(key);
    if (cached) return JSON.parse(cached) as RouteResult;

    const result = await routingProvider.route(from, to);
    if (result) await safeSet(key, JSON.stringify(result));
    return result;
  },
};
