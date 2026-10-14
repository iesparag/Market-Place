import { logger } from '../../config/logger.js';
import type { GeocodeProvider, GeocodeResult } from './types.js';

interface LocationIqItem {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

const BASE_URL = 'https://us1.locationiq.com/v1';

/** Same shape as Nominatim's — LocationIQ is OSM-data-backed and API-compatible by design. */
function normalize(item: LocationIqItem): GeocodeResult {
  const a = item.address ?? {};
  const line1 =
    [a.house_number, a.road || a.neighbourhood || a.suburb].filter(Boolean).join(', ') ||
    (item.display_name?.split(',').slice(0, 2).join(',') ?? '');
  const city = a.city || a.town || a.village || a.municipality || a.county || a.state_district || '';
  const pincode = a.postcode ?? '';
  return {
    label: item.display_name ?? '',
    line1,
    city,
    state: a.state || undefined,
    pincode,
    lat: Number(item.lat),
    lng: Number(item.lon),
  };
}

/**
 * Free-tier (5,000 req/day, no card) geocoder for production use — unlike Nominatim's
 * public instance, LocationIQ is built to be called from servers/cloud infra and
 * doesn't silently block datacenter IPs. Sign up at locationiq.com, set
 * LOCATIONIQ_API_KEY. Same GeocodeProvider interface, so this is a drop-in swap.
 */
export class LocationIqProvider implements GeocodeProvider {
  readonly name = 'locationiq' as const;
  constructor(private readonly apiKey: string) {}

  private async get(path: string): Promise<unknown> {
    try {
      const sep = path.includes('?') ? '&' : '?';
      const res = await fetch(`${BASE_URL}${path}${sep}key=${this.apiKey}&format=json`, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, path }, 'LocationIQ request failed');
        return null;
      }
      return await res.json();
    } catch (err) {
      logger.warn({ err, path }, 'LocationIQ request timed out or errored');
      return null;
    }
  }

  async search(query: string): Promise<GeocodeResult[]> {
    const data = await this.get(`/autocomplete?addressdetails=1&limit=6&q=${encodeURIComponent(query)}`);
    if (!Array.isArray(data)) return [];
    return (data as LocationIqItem[]).map(normalize);
  }

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const data = await this.get(`/reverse?addressdetails=1&lat=${lat}&lon=${lng}`);
    if (!data || typeof data !== 'object') return null;
    return normalize(data as LocationIqItem);
  }
}
