import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { NominatimProvider } from './nominatim.provider.js';
import { LocationIqProvider } from './locationiq.provider.js';
import type { GeocodeProvider } from './types.js';

export * from './types.js';
export { NominatimProvider } from './nominatim.provider.js';
export { LocationIqProvider } from './locationiq.provider.js';

/**
 * auto (default): LocationIQ when a key is configured, else Nominatim.
 * Nominatim's public instance works fine from a laptop but silently drops requests
 * from cloud/datacenter IPs under its anti-abuse policy — that's "auto" instead of
 * defaulting straight to Nominatim: the moment LOCATIONIQ_API_KEY is set in prod,
 * search starts working with zero other changes.
 */
function resolveProvider(): GeocodeProvider {
  const want = env.GEOCODE_PROVIDER === 'auto' ? (env.LOCATIONIQ_API_KEY ? 'locationiq' : 'nominatim') : env.GEOCODE_PROVIDER;

  if (want === 'locationiq') {
    if (!env.LOCATIONIQ_API_KEY) {
      logger.error('GEOCODE_PROVIDER=locationiq but LOCATIONIQ_API_KEY is missing — falling back to Nominatim');
      return new NominatimProvider();
    }
    logger.info('Geocoding: LocationIQ');
    return new LocationIqProvider(env.LOCATIONIQ_API_KEY);
  }

  logger.warn(
    'Geocoding: Nominatim (no LOCATIONIQ_API_KEY) — unreliable from cloud/datacenter IPs, fine for local dev only. ' +
      'Sign up free at locationiq.com and set LOCATIONIQ_API_KEY before relying on this in production.',
  );
  return new NominatimProvider();
}

export const geocodeProvider: GeocodeProvider = resolveProvider();
