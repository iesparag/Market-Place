import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getRedis } from '../../config/redis.js';
import { geocodeProvider } from '../../providers/geocoding/index.js';
import type { GeocodeResult } from '../../providers/geocoding/types.js';

function searchKey(q: string): string {
  return `geocode:search:${q.trim().toLowerCase()}`;
}
function reverseKey(lat: number, lng: number): string {
  return `geocode:reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

/** Redis is a speed optimization here, not a dependency — address search must keep
 * working even if Redis is unreachable/misconfigured, just without caching. */
async function safeGet(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key);
  } catch (err) {
    logger.warn({ err, key }, 'geocode cache read failed — continuing without cache');
    return null;
  }
}
async function safeSet(key: string, value: string): Promise<void> {
  try {
    await getRedis().set(key, value, 'EX', env.GEOCODE_CACHE_TTL_SECONDS);
  } catch (err) {
    logger.warn({ err, key }, 'geocode cache write failed — continuing without cache');
  }
}

export const geocodingService = {
  /** Redis-cached in front of the provider — keeps outbound call volume low across every client. */
  async search(query: string): Promise<GeocodeResult[]> {
    const key = searchKey(query);
    const cached = await safeGet(key);
    if (cached) return JSON.parse(cached) as GeocodeResult[];

    const results = await geocodeProvider.search(query);
    // Don't cache a provider failure (empty array) for 30 days — a transient outage
    // would otherwise lock that query out of search results for a month.
    if (results.length > 0) await safeSet(key, JSON.stringify(results));
    return results;
  },

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const key = reverseKey(lat, lng);
    const cached = await safeGet(key);
    if (cached) return JSON.parse(cached) as GeocodeResult | null;

    const result = await geocodeProvider.reverse(lat, lng);
    if (result) await safeSet(key, JSON.stringify(result));
    return result;
  },
};
