import type { PlaceDetails, PlacePrediction, PlacesProvider } from './types.js';

/** Keyless-safe stub — same shape as every other optional provider in this codebase
 * (PAYMENT_PROVIDER's mock gateway, LOGISTICS_PROVIDER's mock). Everything stays testable
 * with zero GOOGLE_PLACES_API_KEY configured; autocomplete/details just resolve empty. */
export class NullPlacesProvider implements PlacesProvider {
  readonly name = 'none' as const;
  async autocomplete(): Promise<PlacePrediction[]> {
    return [];
  }
  async details(): Promise<PlaceDetails | null> {
    return null;
  }
}
