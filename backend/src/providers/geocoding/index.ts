import { env } from '../../config/env.js';
import { NominatimProvider } from './nominatim.provider.js';
import type { GeocodeProvider } from './types.js';

export * from './types.js';
export { NominatimProvider } from './nominatim.provider.js';

function resolveProvider(): GeocodeProvider {
  switch (env.GEOCODE_PROVIDER) {
    case 'nominatim':
    default:
      return new NominatimProvider();
  }
}

export const geocodeProvider: GeocodeProvider = resolveProvider();
