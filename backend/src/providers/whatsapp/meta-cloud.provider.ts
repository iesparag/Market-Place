import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import type { WhatsAppProvider, WhatsAppTemplateMessage, WhatsAppSendResult } from './types.js';

const GRAPH_VERSION = 'v21.0';

/** WhatsApp Business Platform — Meta Cloud API. Sends a pre-approved template (the
 * platform requires every business-initiated message to use one — free-form text only
 * works inside a 24h window the customer themselves opened by messaging first). */
export class MetaCloudWhatsAppProvider implements WhatsAppProvider {
  async sendTemplate(msg: WhatsAppTemplateMessage): Promise<WhatsAppSendResult> {
    const components: Record<string, unknown>[] = [];
    if (msg.headerImageUrl) {
      components.push({ type: 'header', parameters: [{ type: 'image', image: { link: msg.headerImageUrl } }] });
    }
    if (msg.bodyParams?.length) {
      components.push({ type: 'body', parameters: msg.bodyParams.map((text) => ({ type: 'text', text })) });
    }

    const url = `https://graph.facebook.com/${GRAPH_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: msg.to.replace(/[^\d]/g, ''),
          type: 'template',
          template: { name: msg.templateName, language: { code: msg.languageCode ?? 'en_US' }, components },
        }),
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json()) as { messages?: { id: string }[]; error?: { message?: string } };
      if (!res.ok) {
        logger.error({ status: res.status, json }, '[whatsapp] send failed');
        return { sent: false, error: json?.error?.message ?? `HTTP ${res.status}` };
      }
      return { sent: true, id: json.messages?.[0]?.id };
    } catch (err) {
      logger.error({ err }, '[whatsapp] send threw');
      return { sent: false, error: (err as Error).message };
    }
  }
}
