import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { PlaceDetails, PlacePrediction, PlacesProvider } from './types.js';

interface GoogleAutocompleteResponse {
  status: string;
  predictions?: { place_id: string; description: string }[];
}

interface GoogleAddressComponent {
  long_name: string;
  short_name: string;
  types: string[];
}

interface GoogleDetailsResponse {
  status: string;
  result?: {
    formatted_address?: string;
    address_components?: GoogleAddressComponent[];
    geometry?: { location?: { lat: number; lng: number } };
  };
}

const BASE_URL = 'https://maps.googleapis.com/maps/api/place';

function component(components: GoogleAddressComponent[], type: string): string | undefined {
  return components.find((c) => c.types.includes(type))?.long_name;
}

/** Same normalization spirit as NominatimProvider's `normalize()`. */
function toDetails(placeId: string, data: NonNullable<GoogleDetailsResponse['result']>): PlaceDetails | null {
  const loc = data.geometry?.location;
  if (!loc) return null;
  const comps = data.address_components ?? [];
  const streetNumber = component(comps, 'street_number');
  const route = component(comps, 'route');
  const line1 = [streetNumber, route].filter(Boolean).join(' ') || component(comps, 'sublocality') || '';
  const city = component(comps, 'locality') || component(comps, 'administrative_area_level_2') || '';
  const state = component(comps, 'administrative_area_level_1');
  const pincode = component(comps, 'postal_code') || '';
  return {
    placeId,
    label: data.formatted_address ?? '',
    line1,
    city,
    state,
    pincode,
    lat: loc.lat,
    lng: loc.lng,
  };
}

/**
 * Google Places Autocomplete + Place Details, proxied through our backend (the key never
 * reaches a client). `fields` on the Details call is deliberately restricted — Google bills
 * Details by which field mask you request, and geometry+address_component is the minimum
 * needed here, cheaper than the full default field set.
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = 'google' as const;

  constructor(private readonly apiKey: string) {}

  private async get<T>(path: string, params: Record<string, string | undefined>): Promise<T | null> {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    qs.set('key', this.apiKey);
    try {
      const res = await fetch(`${BASE_URL}${path}?${qs.toString()}`, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        logger.warn({ status: res.status, path }, 'Google Places request failed');
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      logger.warn({ err, path }, 'Google Places request timed out or errored');
      return null;
    }
  }

  async autocomplete(input: string, sessionToken?: string): Promise<PlacePrediction[]> {
    const data = await this.get<GoogleAutocompleteResponse>('/autocomplete/json', {
      input,
      sessiontoken: sessionToken,
      components: env.PLACES_COUNTRY_RESTRICTION ? `country:${env.PLACES_COUNTRY_RESTRICTION}` : undefined,
    });
    if (!data || !Array.isArray(data.predictions)) return [];
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      logger.warn({ status: data.status }, 'Google Places autocomplete non-OK status');
    }
    return data.predictions.map((p) => ({ placeId: p.place_id, description: p.description }));
  }

  async details(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
    const data = await this.get<GoogleDetailsResponse>('/details/json', {
      place_id: placeId,
      sessiontoken: sessionToken,
      fields: 'formatted_address,address_component,geometry',
    });
    if (!data?.result) return null;
    if (data.status !== 'OK') {
      logger.warn({ status: data.status, placeId }, 'Google Places details non-OK status');
      return null;
    }
    return toDetails(placeId, data.result);
  }
}
