import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { MetaCloudWhatsAppProvider } from './meta-cloud.provider.js';
import { MockWhatsAppProvider } from './mock.provider.js';
import type { WhatsAppProvider } from './types.js';

export * from './types.js';

function resolveProvider(): WhatsAppProvider {
  if (env.WHATSAPP_ACCESS_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID) return new MetaCloudWhatsAppProvider();
  logger.warn('WhatsApp: not configured — messages are logged, not sent. Set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID.');
  return new MockWhatsAppProvider();
}

export const whatsappProvider: WhatsAppProvider = resolveProvider();
