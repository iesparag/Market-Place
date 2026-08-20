import { createHmac, randomBytes } from 'node:crypto';
import { safeEqualHex } from './razorpay.provider.js';
import { MockGatewayOrder, MockGatewayPayment } from './mock-gateway.model.js';
import {
  PaymentProviderError,
  type CreateOrderInput,
  type PaymentProvider,
  type ProviderOrder,
  type ProviderPayment,
  type ProviderPaymentStatus,
  type ProviderRefund,
  type ProviderWebhookEvent,
  type RefundInput,
} from './types.js';

const MOCK_SECRET = 'mock_gateway_secret';

/**
 * Keyless dev gateway — same contract as Razorpay, no account needed.
 *
 * The whole stack (checkout → signature verify → ledger → refund → webhook) is
 * exercised exactly as in production; only the network hop is simulated. Clients see
 * `provider: "mock"` in the checkout response and skip opening a real SDK sheet.
 *
 * It is deliberately *not* a free pass: signatures are still HMAC-verified and an
 * unknown payment id is rejected, so a client cannot mark an order paid by inventing
 * ids. State lives in Mongo so it survives a restart, like a real gateway would.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;
  readonly publicKey = 'mock_key';
  readonly live = false;

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const providerOrderId = `order_mock_${randomBytes(8).toString('hex')}`;
    await MockGatewayOrder.create({
      providerOrderId,
      amount: input.amount,
      currency: input.currency,
    });
    return { providerOrderId, amount: input.amount, currency: input.currency, publicKey: this.publicKey };
  }

  /**
   * Dev helper: what a real SDK hands back after the customer pays. Reached through
   * `POST /payments/mock-pay`. Re-calling it for an order that already has a payment
   * returns the SAME handshake, mirroring a gateway that won't charge twice.
   */
  async simulateSuccess(providerOrderId: string): Promise<{ providerPaymentId: string; signature: string }> {
    const order = await MockGatewayOrder.findOne({ providerOrderId }).lean();
    if (!order) throw new PaymentProviderError('ORDER_NOT_FOUND', 'Unknown mock order', 400);

    const existing = await MockGatewayPayment.findOne({ providerOrderId }).lean();
    if (existing)
      return {
        providerPaymentId: existing.providerPaymentId,
        signature: sign(providerOrderId, existing.providerPaymentId),
      };

    const providerPaymentId = `pay_mock_${randomBytes(8).toString('hex')}`;
    await MockGatewayPayment.create({
      providerPaymentId,
      providerOrderId,
      status: 'captured',
      amount: order.amount,
      currency: order.currency,
      method: 'upi',
      captured: true,
    });
    return { providerPaymentId, signature: sign(providerOrderId, providerPaymentId) };
  }

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    return safeEqualHex(sign(input.providerOrderId, input.providerPaymentId), input.signature);
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    const p = await MockGatewayPayment.findOne({ providerPaymentId }).lean();
    if (!p) throw new PaymentProviderError('PAYMENT_NOT_FOUND', 'Unknown mock payment', 400);
    return {
      providerPaymentId: p.providerPaymentId,
      providerOrderId: p.providerOrderId,
      status: p.status as ProviderPaymentStatus,
      amount: p.amount,
      amountRefunded: p.amountRefunded ?? 0,
      currency: p.currency ?? 'INR',
      method: p.method ?? 'upi',
      captured: p.captured ?? true,
    };
  }

  async capture(providerPaymentId: string): Promise<ProviderPayment> {
    await MockGatewayPayment.updateOne({ providerPaymentId }, { $set: { status: 'captured', captured: true } });
    return this.fetchPayment(providerPaymentId);
  }

  async refund(providerPaymentId: string, input: RefundInput): Promise<ProviderRefund> {
    const p = await this.fetchPayment(providerPaymentId);
    const amountRefunded = p.amountRefunded + input.amount;
    if (amountRefunded > p.amount)
      throw new PaymentProviderError('REFUND_TOO_LARGE', 'Refund exceeds captured amount', 400);
    await MockGatewayPayment.updateOne(
      { providerPaymentId },
      { $set: { amountRefunded, ...(amountRefunded >= p.amount ? { status: 'refunded' } : {}) } },
    );
    return { refundId: `rfnd_mock_${randomBytes(6).toString('hex')}`, amount: input.amount, status: 'processed' };
  }

  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string | undefined>): ProviderWebhookEvent {
    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const signature = headers['x-razorpay-signature'] ?? headers['x-mock-signature'];
    const expected = createHmac('sha256', MOCK_SECRET).update(body).digest('hex');
    if (!signature || !safeEqualHex(expected, signature))
      throw new PaymentProviderError('BAD_SIGNATURE', 'Webhook signature verification failed', 400);
    const parsed = JSON.parse(body.toString('utf8')) as { event?: string; payload?: Record<string, unknown>; id?: string };
    // Same precedence as the real gateway: delivery id from the header, then the
    // body, then a content hash — so dedupe behaves identically in dev and prod.
    const id = headers['x-razorpay-event-id'] ?? parsed.id ?? expected.slice(0, 32);
    return { id, type: parsed.event ?? 'unknown', payload: parsed.payload ?? {} };
  }
}

function sign(providerOrderId: string, providerPaymentId: string): string {
  return createHmac('sha256', MOCK_SECRET).update(`${providerOrderId}|${providerPaymentId}`).digest('hex');
}
