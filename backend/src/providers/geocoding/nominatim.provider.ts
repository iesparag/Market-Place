import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { GeocodeProvider, GeocodeResult } from './types.js';

interface NominatimItem {
  lat: string;
  lon: string;
  display_name: string;
  address?: Record<string, string>;
}

const BASE_URL = 'https://nominatim.openstreetmap.org';

/** Same line1/city/pincode normalization already proven in customerfacing's LocationPickerComponent. */
function normalize(item: NominatimItem): GeocodeResult {
  const a = item.address ?? {};
  const sub = a.suburb || a.neighbourhood || a.subdivision;
  const line1 =
    [a.house_number, a.road, sub].filter(Boolean).join(', ') ||
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
 * Free, keyless geocoder backed by OpenStreetMap data. Single-process throttle keeps
 * us under Nominatim's ~1 req/sec usage-policy ceiling; the Redis cache in front of this
 * (see geocoding.service.ts) is what actually keeps outbound call volume low in practice.
 * Upgrade path at scale: self-hosted Nominatim/Photon, or a generous-free-tier host like
 * LocationIQ — both are a one-file swap behind this same interface.
 */
export class NominatimProvider implements GeocodeProvider {
  readonly name = 'nominatim' as const;
  private lastRequestAt = 0;
  private readonly minIntervalMs = 1000;

  private async throttle(): Promise<void> {
    const wait = this.lastRequestAt + this.minIntervalMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastRequestAt = Date.now();
  }

  private async get(path: string): Promise<unknown> {
    await this.throttle();
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': env.GEOCODE_USER_AGENT },
        // Nominatim silently drops (never responds to) requests it anti-abuse-flags —
        // notably from cloud/datacenter IPs — rather than returning an error. Without a
        // hard deadline that hangs the request forever instead of just failing the search.
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        logger.warn({ status: res.status, path }, 'Nominatim request failed');
        return null;
      }
      return await res.json();
    } catch (err) {
      logger.warn({ err, path }, 'Nominatim request timed out or errored');
      return null;
    }
  }

  async search(query: string): Promise<GeocodeResult[]> {
    const data = await this.get(
      `/search?format=json&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`,
    );
    if (!Array.isArray(data)) return [];
    return (data as NominatimItem[]).map(normalize);
  }

  async reverse(lat: number, lng: number): Promise<GeocodeResult | null> {
    const data = await this.get(`/reverse?format=json&addressdetails=1&lat=${lat}&lon=${lng}`);
    if (!data || typeof data !== 'object') return null;
    return normalize(data as NominatimItem);
  }
}
