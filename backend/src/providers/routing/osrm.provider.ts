import { logger } from '../../config/logger.js';
import type { RouteResult, RoutingProvider } from './types.js';

interface OsrmResponse {
  code: string;
  routes?: { geometry: { coordinates: [number, number][] }; distance: number; duration: number }[];
}

/**
 * Self-hosted OSRM (Open Source Routing Machine) — free, no per-request billing, unlike
 * Google/Mapbox Directions APIs. Deliberately points at a self-hosted instance, never
 * the public router.project-osrm.org demo server: OSRM's own usage policy says that
 * demo server isn't for production traffic. See docker/osrm/README.md for how to stand
 * one up (one Docker container + a regional .osm.pbf extract, e.g. India).
 */
export class OsrmProvider implements RoutingProvider {
  readonly name = 'osrm' as const;

  constructor(private readonly baseUrl: string) {}

  async route(from: { lat: number; lng: number }, to: { lat: number; lng: number }): Promise<RouteResult | null> {
    const coords = `${from.lng},${from.lat};${to.lng},${to.lat}`;
    const url = `${this.baseUrl}/route/v1/driving/${coords}?overview=full&geometries=geojson`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        logger.warn({ status: res.status }, 'OSRM request failed');
        return null;
      }
      const data = (await res.json()) as OsrmResponse;
      const best = data.routes?.[0];
      if (data.code !== 'Ok' || !best) {
        logger.warn({ code: data.code }, 'OSRM returned no route');
        return null;
      }
      return { coordinates: best.geometry.coordinates, distanceMeters: best.distance, durationSeconds: best.duration };
    } catch (err) {
      logger.warn({ err }, 'OSRM request timed out or errored');
      return null;
    }
  }
}
