import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { RazorpayProvider, safeEqualHex } from '../../../providers/payment/razorpay.provider.js';

const KEY_ID = 'rzp_test_key';
const KEY_SECRET = 'test_secret';
const WEBHOOK_SECRET = 'whsec_test';

const provider = new RazorpayProvider(KEY_ID, KEY_SECRET, WEBHOOK_SECRET);

describe('checkout signature verification', () => {
  const providerOrderId = 'order_ABC123';
  const providerPaymentId = 'pay_XYZ789';
  const valid = createHmac('sha256', KEY_SECRET)
    .update(`${providerOrderId}|${providerPaymentId}`)
    .digest('hex');

  it('accepts the gateway signature', () => {
    expect(provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature: valid })).toBe(true);
  });

  it('rejects a forged signature', () => {
    expect(
      provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature: 'f'.repeat(64) }),
    ).toBe(false);
  });

  it('rejects a signature bound to a different order (replay across orders)', () => {
    expect(
      provider.verifyCheckoutSignature({
        providerOrderId: 'order_OTHER',
        providerPaymentId,
        signature: valid,
      }),
    ).toBe(false);
  });

  it('rejects an empty / truncated signature instead of throwing', () => {
    expect(provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature: '' })).toBe(false);
    expect(
      provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature: valid.slice(0, 10) }),
    ).toBe(false);
  });
});

describe('webhook signature verification', () => {
  const body = JSON.stringify({
    event: 'payment.captured',
    payload: { payment: { entity: { id: 'pay_1', order_id: 'order_1', status: 'captured', amount: 10000, currency: 'INR', captured: true } } },
  });
  const sign = (b: string, secret = WEBHOOK_SECRET) => createHmac('sha256', secret).update(b).digest('hex');

  it('parses a correctly signed webhook', () => {
    const event = provider.verifyWebhook(body, {
      'x-razorpay-signature': sign(body),
      'x-razorpay-event-id': 'evt_123',
    });
    expect(event.id).toBe('evt_123');
    expect(event.type).toBe('payment.captured');
  });

  it('verifies over the RAW bytes — a re-serialised body must not validate', () => {
    // Same JSON semantically, different bytes (key order / whitespace).
    const reserialised = JSON.stringify(JSON.parse(body), null, 2);
    expect(() =>
      provider.verifyWebhook(reserialised, { 'x-razorpay-signature': sign(body), 'x-razorpay-event-id': 'e' }),
    ).toThrow(/signature/i);
  });

  it('rejects a body signed with the wrong secret', () => {
    expect(() =>
      provider.verifyWebhook(body, { 'x-razorpay-signature': sign(body, 'attacker'), 'x-razorpay-event-id': 'e' }),
    ).toThrow(/signature/i);
  });

  it('rejects a webhook with no signature header', () => {
    expect(() => provider.verifyWebhook(body, {})).toThrow(/signature/i);
  });

  it('falls back to a content hash when the event-id header is missing', () => {
    const event = provider.verifyWebhook(body, { 'x-razorpay-signature': sign(body) });
    expect(event.id).toHaveLength(32);
  });
});

describe('safeEqualHex', () => {
  it('is false on length mismatch rather than throwing', () => {
    expect(safeEqualHex('abcd', 'abc')).toBe(false);
    expect(safeEqualHex('abcd', 'abcd')).toBe(true);
  });
});
