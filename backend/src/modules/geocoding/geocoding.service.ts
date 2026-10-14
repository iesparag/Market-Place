import { env } from '../../config/env.js';
import { getRedis } from '../../config/redis.js';
import { geocodeProvider } from '../../providers/geocoding/index.js';
import type { GeocodeResult } from '../../providers/geocoding/types.js';

function searchKey(q: string): string {
  return `geocode:search:${q.trim().toLowerCase()}`;
}
function reverseKey(lat: number, lng: number): string {
  return `geocode:reverse:${lat.toFixed(5)}:${lng.toFixed(5)}`;
}

export const geocodingService = {
  /** Redis-cached in front of the provider — keeps outbound call volume low across every client. */
  async search(query: string): Promise<GeocodeResult[]> {
    const redis = getRedis();
    const key = searchKey(query);
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as GeocodeResult[];

    const results = await geocodeProvider.search(query);
    // Don't cache a provider failure (empty array) for 30 days — a transient outage
    // would otherwise lock that query out of search results for a month.
    if (results.length > 0) await redis.set(key, JSON.stringify(results), 'EX', env.GEOCODE_CACHE_TTL_SECONDS);
    return results;
  },

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const redis = getRedis();
    const key = reverseKey(lat, lng);
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as GeocodeResult | null;

    const result = await geocodeProvider.reverse(lat, lng);
    if (result) await redis.set(key, JSON.stringify(result), 'EX', env.GEOCODE_CACHE_TTL_SECONDS);
    return result;
  },
};
