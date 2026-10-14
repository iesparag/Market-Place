import { logger } from '../../config/logger.js';
import type { WhatsAppProvider, WhatsAppTemplateMessage, WhatsAppSendResult } from './types.js';

/** Dev / not-yet-configured fallback — logs instead of sending, same shape as every
 * other keyless-safe provider in this codebase (push, payments, logistics, geocoding). */
export class MockWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    logger.info(
      { to: msg.to, template: msg.templateName },
      '[whatsapp] would send — set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID to go live',
    );
    return { sent: false, error: 'WhatsApp not configured' };
  }
}
