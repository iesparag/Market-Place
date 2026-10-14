import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { env } from '../../config/env.js';
import type { DispatchInput, DispatchResult, LogisticsProvider, LogisticsWebhookEvent } from './types.js';
import { LogisticsProviderError } from './types.js';

function safeEqualHex(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}

/**
 * Keyless dev/demo logistics gateway — no real courier dispatched, no API key needed.
 * `dispatch` just mints a fake tracking id; status changes arrive the same way a real
 * provider's would, through POST /webhooks/logistics (HMAC-signed with
 * LOGISTICS_WEBHOOK_SECRET), so the whole inbound pipeline is exercised in dev even
 * with no real courier wired up. Swapping in a real provider (Shiprocket/Porter/etc.)
 * is a new file implementing this same interface — see providers/payment for the template.
 */
export class MockLogisticsProvider implements LogisticsProvider {
  readonly name = 'mock' as const;

  async dispatch(_input: DispatchInput): Promise<DispatchResult> {
    const externalTaskId = `mock_${randomUUID()}`;
    return { externalTaskId, trackingUrl: `https://track.example/mock/${externalTaskId}` };
  }

  async cancel(_externalTaskId: string): Promise<void> {
    // No-op — nothing real to cancel in the mock gateway.
  }

  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string | undefined>): LogisticsWebhookEvent {
    const signature = headers['x-logistics-signature'];
    if (!signature) throw new LogisticsProviderError('NO_SIGNATURE', 'Missing webhook signature', 400);

    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expected = createHmac('sha256', env.LOGISTICS_WEBHOOK_SECRET).update(body).digest('hex');
    if (!safeEqualHex(expected, signature))
      throw new LogisticsProviderError('BAD_SIGNATURE', 'Webhook signature verification failed', 400);

    const parsed = JSON.parse(body.toString('utf8')) as { id?: string; type?: string; payload?: Record<string, unknown> };
    const id = parsed.id ?? createHmac('sha256', 'evt').update(body).digest('hex').slice(0, 32);
    return { id, type: parsed.type ?? 'unknown', payload: parsed.payload ?? {} };
  }
}
