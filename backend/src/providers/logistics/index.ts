import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { MockLogisticsProvider } from './mock.provider.js';
import type { LogisticsProvider } from './types.js';

export * from './types.js';
export { MockLogisticsProvider } from './mock.provider.js';

function resolveProvider(): LogisticsProvider {
  switch (env.LOGISTICS_PROVIDER) {
    case 'mock':
    default:
      logger.warn('Logistics: MOCK gateway — no real courier is dispatched for third-party-routed tasks');
      return new MockLogisticsProvider();
  }
}

export const logisticsProvider: LogisticsProvider = resolveProvider();
