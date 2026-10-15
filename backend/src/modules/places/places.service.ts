import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { getRedis } from '../../config/redis.js';
import { placesProvider } from '../../providers/places/index.js';
import type { PlaceDetails, PlacePrediction } from '../../providers/places/types.js';

function autocompleteKey(input: string): string {
  return `places:ac:${input.trim().toLowerCase()}`;
}
function detailsKey(placeId: string): string {
  return `places:details:${placeId}`;
}

/** Redis is a speed/cost optimization here, not a dependency — same contract as
 * geocoding.service.ts's safeGet/safeSet: never let a cache outage break address entry. */
async function safeGet(key: string): Promise<string | null> {
  try {
    return await getRedis().get(key);
  } catch (err) {
    logger.warn({ err, key }, 'places cache read failed — continuing without cache');
    return null;
  }
}
async function safeSet(key: string, value: string, ttlSeconds: number): Promise<void> {
  try {
    await getRedis().set(key, value, 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, 'places cache write failed — continuing without cache');
  }
}

export const placesService = {
  /** Cached by exact input text — this is the concrete "same address shouldn't re-bill
   * Google" guarantee. Short TTL (default 1 day) since it's keyed on free-typed text. */
  async autocomplete(input: string, sessionToken?: string): Promise<PlacePrediction[]> {
    const key = autocompleteKey(input);
    const cached = await safeGet(key);
    if (cached) return JSON.parse(cached) as PlacePrediction[];

    const predictions = await placesProvider.autocomplete(input, sessionToken);
    // Don't cache empty/failed results — a transient Google error shouldn't lock a
    // valid query out of autocomplete for the full TTL.
    if (predictions.length > 0) {
      await safeSet(key, JSON.stringify(predictions), env.PLACES_AUTOCOMPLETE_CACHE_TTL_SECONDS);
    }
    return predictions;
  },

  /** Cached by place_id — long TTL (default 90 days) since a place's coordinates
   * essentially never change. This is the expensive call; cache it hardest. */
  async details(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
    const key = detailsKey(placeId);
    const cached = await safeGet(key);
    if (cached) return JSON.parse(cached) as PlaceDetails | null;

    const result = await placesProvider.details(placeId, sessionToken);
    if (result) await safeSet(key, JSON.stringify(result), env.PLACES_DETAILS_CACHE_TTL_SECONDS);
    return result;
  },
};
