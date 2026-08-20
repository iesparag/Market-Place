import { createHmac, timingSafeEqual } from 'node:crypto';
import { logger } from '../../config/logger.js';
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

const API = 'https://api.razorpay.com/v1';

/** Razorpay's payment entity as we consume it (only the fields we rely on). */
interface RzpPayment {
  id: string;
  order_id?: string;
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed';
  amount: number;
  amount_refunded?: number;
  currency: string;
  method?: string;
  captured?: boolean;
  error_code?: string | null;
  error_description?: string | null;
}

interface RzpOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
}

interface RzpRefund {
  id: string;
  amount: number;
  status: string;
}

/**
 * Razorpay adapter over the REST API (no SDK — one less dependency to keep current,
 * and `fetch` + `node:crypto` is all this needs).
 *
 * Money notes:
 *  - Razorpay amounts are already in **paise**, same as ours — no conversion anywhere.
 *  - Orders are created with `payment_capture: 1` so an authorized payment is captured
 *    automatically; `capture()` stays as a safety net for manual-capture accounts.
 */
export class RazorpayProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;
  readonly live = true;
  private readonly auth: string;

  constructor(
    readonly publicKey: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {
    this.auth = `Basic ${Buffer.from(`${publicKey}:${keySecret}`).toString('base64')}`;
  }

  private async call<T>(
    path: string,
    init: { method: 'GET' | 'POST'; body?: unknown; idempotencyKey?: string },
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: this.auth,
      'Content-Type': 'application/json',
    };
    // Razorpay honours this on order/refund creation, so a network retry cannot
    // create a second gateway object.
    if (init.idempotencyKey) headers['X-Razorpay-Idempotency-Key'] = init.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(`${API}${path}`, {
        method: init.method,
        headers,
        body: init.body ? JSON.stringify(init.body) : undefined,
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      logger.error({ err, path }, 'razorpay: network error');
      throw new PaymentProviderError('GATEWAY_UNREACHABLE', 'Payment gateway is unreachable. Please try again.');
    }

    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }

    if (!res.ok) {
      const e = (json as { error?: { code?: string; description?: string } }).error;
      logger.error({ path, status: res.status, error: e }, 'razorpay: api error');
      throw new PaymentProviderError(
        e?.code ?? `HTTP_${res.status}`,
        e?.description ?? `Payment gateway error (${res.status})`,
        res.status === 400 ? 400 : 502,
      );
    }
    return json as T;
  }

  async createOrder(input: CreateOrderInput): Promise<ProviderOrder> {
    const order = await this.call<RzpOrder>('/orders', {
      method: 'POST',
      idempotencyKey: input.idempotencyKey,
      body: {
        amount: input.amount,
        currency: input.currency,
        receipt: input.receipt.slice(0, 40), // Razorpay caps receipt at 40 chars
        payment_capture: 1,
        notes: input.notes ?? {},
      },
    });
    return {
      providerOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
      publicKey: this.publicKey,
    };
  }

  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean {
    const expected = createHmac('sha256', this.keySecret)
      .update(`${input.providerOrderId}|${input.providerPaymentId}`)
      .digest('hex');
    return safeEqualHex(expected, input.signature);
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment> {
    return normalise(await this.call<RzpPayment>(`/payments/${providerPaymentId}`, { method: 'GET' }));
  }

  async capture(providerPaymentId: string, amount: number, currency: string): Promise<ProviderPayment> {
    return normalise(
      await this.call<RzpPayment>(`/payments/${providerPaymentId}/capture`, {
        method: 'POST',
        body: { amount, currency },
      }),
    );
  }

  async refund(providerPaymentId: string, input: RefundInput): Promise<ProviderRefund> {
    const r = await this.call<RzpRefund>(`/payments/${providerPaymentId}/refund`, {
      method: 'POST',
      idempotencyKey: input.idempotencyKey,
      body: { amount: input.amount, speed: 'normal', notes: input.notes ?? {} },
    });
    return { refundId: r.id, amount: r.amount, status: r.status };
  }

  verifyWebhook(
    rawBody: Buffer | string,
    headers: Record<string, string | undefined>,
  ): ProviderWebhookEvent {
    const signature = headers['x-razorpay-signature'];
    if (!signature) throw new PaymentProviderError('NO_SIGNATURE', 'Missing webhook signature', 400);
    if (!this.webhookSecret)
      throw new PaymentProviderError('NO_WEBHOOK_SECRET', 'RAZORPAY_WEBHOOK_SECRET is not configured', 500);

    const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');
    const expected = createHmac('sha256', this.webhookSecret).update(body).digest('hex');
    if (!safeEqualHex(expected, signature))
      throw new PaymentProviderError('BAD_SIGNATURE', 'Webhook signature verification failed', 400);

    const parsed = JSON.parse(body.toString('utf8')) as { event?: string; payload?: Record<string, unknown> };
    // Razorpay's delivery id lives in the header; fall back to a content hash so
    // dedupe still works if the header is ever absent.
    const id =
      headers['x-razorpay-event-id'] ??
      createHmac('sha256', 'evt').update(body).digest('hex').slice(0, 32);

    return { id, type: parsed.event ?? 'unknown', payload: parsed.payload ?? {} };
  }
}

function normalise(p: RzpPayment): ProviderPayment {
  return {
    providerPaymentId: p.id,
    providerOrderId: p.order_id,
    status: p.status as ProviderPaymentStatus,
    amount: p.amount,
    amountRefunded: p.amount_refunded ?? 0,
    currency: p.currency,
    method: p.method,
    captured: p.captured ?? p.status === 'captured',
    errorCode: p.error_code ?? undefined,
    errorDescription: p.error_description ?? undefined,
  };
}

/** Constant-time hex compare (length-safe — timingSafeEqual throws on length mismatch). */
export function safeEqualHex(expected: string, received: string): boolean {
  if (typeof received !== 'string' || expected.length !== received.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected, 'utf8'), Buffer.from(received, 'utf8'));
  } catch {
    return false;
  }
}
