import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { OsrmProvider } from './osrm.provider.js';
import { NullRoutingProvider } from './null.provider.js';
import type { RoutingProvider } from './types.js';

export * from './types.js';
export { OsrmProvider } from './osrm.provider.js';

function resolveProvider(): RoutingProvider {
  if (env.OSRM_BASE_URL) {
    logger.info({ baseUrl: env.OSRM_BASE_URL }, 'Routing: OSRM');
    return new OsrmProvider(env.OSRM_BASE_URL);
  }
  logger.warn('Routing: no OSRM_BASE_URL set — route() returns null everywhere (keyless dev mode). See docker/osrm/README.md.');
  return new NullRoutingProvider();
}

export const routingProvider: RoutingProvider = resolveProvider();
