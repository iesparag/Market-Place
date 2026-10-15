import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { GooglePlacesProvider } from './google.provider.js';
import { NullPlacesProvider } from './null.provider.js';
import type { PlacesProvider } from './types.js';

export * from './types.js';
export { GooglePlacesProvider } from './google.provider.js';

function resolveProvider(): PlacesProvider {
  if (env.GOOGLE_PLACES_API_KEY) {
    logger.info('Places: Google Places API');
    return new GooglePlacesProvider(env.GOOGLE_PLACES_API_KEY);
  }
  logger.warn('Places: no GOOGLE_PLACES_API_KEY set — autocomplete/details return empty (keyless dev mode).');
  return new NullPlacesProvider();
}

export const placesProvider: PlacesProvider = resolveProvider();
