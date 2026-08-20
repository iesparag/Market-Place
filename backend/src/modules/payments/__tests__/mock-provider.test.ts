import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { MockPaymentProvider } from '../../../providers/payment/mock.provider.js';

/**
 * Pure-crypto surface of the dev gateway. Its stateful behaviour (order/payment
 * persistence, refund caps) is DB-backed and covered by the end-to-end trace in
 * docs/05-PAYMENTS.md rather than here, so `npm test` stays runnable without Mongo.
 */
describe('mock gateway signatures (keyless dev mode)', () => {
  const provider = new MockPaymentProvider();
  const providerOrderId = 'order_mock_deadbeef';
  const providerPaymentId = 'pay_mock_cafebabe';

  // Reproduces exactly what the provider hands the client after a simulated success.
  const signature = signMock(`${providerOrderId}|${providerPaymentId}`);

  it('accepts its own handshake', () => {
    expect(provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature })).toBe(true);
  });

  it('rejects an invented payment id — the dev gateway is not a free pass', () => {
    expect(
      provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId: 'pay_made_up', signature }),
    ).toBe(false);
  });

  it('rejects a signature lifted from another order', () => {
    expect(
      provider.verifyCheckoutSignature({ providerOrderId: 'order_mock_other', providerPaymentId, signature }),
    ).toBe(false);
  });

  it('verifies webhooks over the raw body and prefers the event-id header', () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: {} });
    const event = provider.verifyWebhook(body, {
      'x-razorpay-signature': signMock(body),
      'x-razorpay-event-id': 'evt_mock_1',
    });
    expect(event.id).toBe('evt_mock_1');
    expect(event.type).toBe('payment.captured');
    expect(() => provider.verifyWebhook(body, { 'x-razorpay-signature': 'bad' })).toThrow(/signature/i);
  });
});

describe('refund cap arithmetic (payments.service)', () => {
  /** refundable = what was captured − what has already gone back. */
  const refundable = (amountPaid: number, alreadyRefunded: number) => amountPaid - alreadyRefunded;

  it('allows the full amount on an untouched payment', () => {
    expect(refundable(100000, 0)).toBe(100000);
  });

  it('shrinks after a partial refund, so the second refund cannot exceed the remainder', () => {
    const paid = 100000;
    const first = 40000;
    expect(refundable(paid, first)).toBe(60000);
    expect(refundable(paid, first + 60000)).toBe(0);
  });

  it('leaves nothing refundable once fully returned', () => {
    expect(refundable(100000, 100000)).toBe(0);
  });
});

function signMock(payload: string): string {
  return createHmac('sha256', 'mock_gateway_secret').update(payload).digest('hex');
}
