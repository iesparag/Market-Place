/**
 * Address geocoding provider abstraction (free, OSM-backed by default).
 *
 * Everything address-search-related goes through this interface so the backing
 * service can be swapped (Nominatim → self-hosted Photon → LocationIQ) without
 * touching the geocoding module or any client.
 */

export type GeocodeProviderName = 'nominatim';

export interface GeocodeResult {
  label: string;
  line1: string;
  city: string;
  state?: string;
  pincode: string;
  lat: number;
  lng: number;
}

export interface GeocodeProvider {
  readonly name: GeocodeProviderName;
  search(query: string): Promise<GeocodeResult[]>;
  reverse(lat: number, lng: number): Promise<GeocodeResult | null>;
}
