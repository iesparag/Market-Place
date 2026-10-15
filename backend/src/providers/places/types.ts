/**
 * Google Places abstraction (autocomplete + details only — distinct from the
 * free-text `geocoding` module, which stays on Nominatim/LocationIQ for reverse-geocode).
 *
 * Deliberately two calls, not one `search()`: Autocomplete returns predictions with
 * no lat/lng (cheap, debounced per keystroke); Details resolves exactly ONE chosen
 * prediction to coordinates (billed separately). Collapsing these into a single
 * "search and resolve everything" call would mean N Details calls per keystroke
 * instead of 1 per actual address picked — the opposite of cost-optimized.
 */

export interface PlacePrediction {
  placeId: string;
  description: string;
}

export interface PlaceDetails {
  placeId: string;
  label: string;
  line1: string;
  city: string;
  state?: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface PlacesProvider {
  readonly name: string;
  autocomplete(input: string, sessionToken?: string): Promise<PlacePrediction[]>;
  details(placeId: string, sessionToken?: string): Promise<PlaceDetails | null>;
}
