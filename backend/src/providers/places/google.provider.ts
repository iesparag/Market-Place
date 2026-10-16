import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { PlaceDetails, PlacePrediction, PlacesProvider } from './types.js';

interface NewAutocompleteResponse {
  suggestions?: {
    placePrediction?: { placeId: string; text?: { text: string } };
  }[];
}

interface NewAddressComponent {
  longText: string;
  shortText: string;
  types: string[];
}

interface NewDetailsResponse {
  formattedAddress?: string;
  addressComponents?: NewAddressComponent[];
  location?: { latitude: number; longitude: number };
}

const BASE_URL = 'https://places.googleapis.com/v1';

function component(components: NewAddressComponent[], type: string): string | undefined {
  return components.find((c) => c.types.includes(type))?.longText;
}

/** Standard Google Maps address component mapping for India and globally. */
function toDetails(placeId: string, data: NewDetailsResponse): PlaceDetails | null {
  const loc = data.location;
  if (!loc) return null;
  const comps = data.addressComponents ?? [];
  const streetNumber = component(comps, 'street_number');
  const route = component(comps, 'route');
  const sublocality = component(comps, 'sublocality') || component(comps, 'sublocality_level_1') || component(comps, 'neighborhood');
  
  // Locality is the official City in Google Maps. If missing (rural), fall back to District.
  const city = component(comps, 'locality') || component(comps, 'administrative_area_level_2') || '';
  const state = component(comps, 'administrative_area_level_1');
  const pincode = component(comps, 'postal_code') || '';

  // Mohalla / sublocality goes to line1 (e.g. "Chanakyapuri" or "Shop 12, Main Road, Chanakyapuri")
  const lineParts = [streetNumber, route, sublocality].filter(Boolean);
  const line1 = lineParts.join(', ') || sublocality || '';

  return {
    placeId,
    label: data.formattedAddress ?? '',
    line1,
    city,
    state,
    pincode,
    lat: loc.latitude,
    lng: loc.longitude,
  };
}




/**
 * Google Places Autocomplete + Place Details (New API), proxied through our backend (the
 * key never reaches a client). Legacy `maps.googleapis.com/maps/api/place/*` is not
 * enabled for new Cloud projects (Google returns REQUEST_DENIED with a migration
 * notice), so this talks to `places.googleapis.com/v1` instead — POST + JSON body for
 * autocomplete, header-based key + field mask instead of query params.
 *
 * `X-Goog-FieldMask` is deliberately minimal — the New API bills Details by which fields
 * you request, so asking for exactly what `toDetails()` needs (not the full default set)
 * keeps this at the cheapest "Essentials" tier.
 */
export class GooglePlacesProvider implements PlacesProvider {
  readonly name = 'google' as const;

  constructor(private readonly apiKey: string) {}

  private async post<T>(path: string, body: Record<string, unknown>, fieldMask: string): Promise<T | null> {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.apiKey,
          'X-Goog-FieldMask': fieldMask,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.warn({ status: res.status, path, errBody }, 'Google Places (New) request failed');
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      logger.warn({ err, path }, 'Google Places (New) request timed out or errored');
      return null;
    }
  }

  private async get<T>(path: string, fieldMask: string): Promise<T | null> {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { 'X-Goog-Api-Key': this.apiKey, 'X-Goog-FieldMask': fieldMask },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const errBody = await res.text().catch(() => '');
        logger.warn({ status: res.status, path, errBody }, 'Google Places (New) request failed');
        return null;
      }
      return (await res.json()) as T;
    } catch (err) {
      logger.warn({ err, path }, 'Google Places (New) request timed out or errored');
      return null;
    }
  }

  async autocomplete(input: string, sessionToken?: string): Promise<PlacePrediction[]> {
    const data = await this.post<NewAutocompleteResponse>(
      '/places:autocomplete',
      {
        input,
        sessionToken,
        includedRegionCodes: env.PLACES_COUNTRY_RESTRICTION ? [env.PLACES_COUNTRY_RESTRICTION] : undefined,
      },
      'suggestions.placePrediction.placeId,suggestions.placePrediction.text',
    );
    if (!data || !Array.isArray(data.suggestions)) return [];
    return data.suggestions
      .map((s) => s.placePrediction)
      .filter((p): p is NonNullable<typeof p> => !!p?.placeId)
      .map((p) => ({ placeId: p.placeId, description: p.text?.text ?? '' }));
  }

  async details(placeId: string, sessionToken?: string): Promise<PlaceDetails | null> {
    const qs = sessionToken ? `?sessionToken=${encodeURIComponent(sessionToken)}` : '';
    const data = await this.get<NewDetailsResponse>(
      `/places/${encodeURIComponent(placeId)}${qs}`,
      'formattedAddress,addressComponents,location',
    );
    if (!data) return null;
    return toDetails(placeId, data);
  }
}
