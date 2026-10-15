import type { RouteResult, RoutingProvider } from './types.js';

/** No OSRM instance configured — customer_app falls back to a straight-line marker
 * (no polyline), same keyless-safe shape as every other optional provider here. */
export class NullRoutingProvider implements RoutingProvider {
  readonly name = 'none' as const;
  async route(): Promise<RouteResult | null> {
    return null;
  }
}
