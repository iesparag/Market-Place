/**
 * Payment provider abstraction (India-first: Razorpay — UPI, cards, netbanking, wallets).
 *
 * Everything money-related goes through this interface so the gateway can be swapped
 * (Razorpay → Cashfree → PhonePe → Stripe) without touching orders / ledger / payouts.
 * See docs/05-PAYMENTS.md.
 */

export type PaymentProviderName = 'razorpay' | 'mock';

/** A gateway-side order the client SDK opens checkout against. */
export interface ProviderOrder {
  providerOrderId: string;
  amount: number; // minor units (paise)
  currency: string;
  /** Publishable key the web/app SDK needs. Never the secret. */
  publicKey: string;
}

export type ProviderPaymentStatus =
  | 'created'
  | 'authorized'
  | 'captured'
  | 'refunded'
  | 'failed';

/** Normalised view of a gateway payment — the shape our services reason about. */
export interface ProviderPayment {
  providerPaymentId: string;
  providerOrderId?: string;
  status: ProviderPaymentStatus;
  amount: number;
  amountRefunded: number;
  currency: string;
  /** upi | card | netbanking | wallet | emi … (gateway's own label) */
  method?: string;
  captured: boolean;
  errorCode?: string;
  errorDescription?: string;
}

export interface ProviderRefund {
  refundId: string;
  amount: number;
  status: string; // pending | processed | failed
}

/** A verified inbound webhook. `id` is what we dedupe on. */
export interface ProviderWebhookEvent {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

export interface CreateOrderInput {
  amount: number; // minor units
  currency: string;
  /** Our order number — shows on the gateway dashboard, max 40 chars. */
  receipt: string;
  notes?: Record<string, string>;
  /** Passed to the gateway so a network retry cannot create two gateway orders. */
  idempotencyKey?: string;
}

export interface RefundInput {
  amount: number; // minor units
  notes?: Record<string, string>;
  idempotencyKey: string;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  /** Publishable key for the client SDK ('' for the mock provider). */
  readonly publicKey: string;
  /** True when real credentials are configured (false ⇒ dev mock). */
  readonly live: boolean;

  createOrder(input: CreateOrderInput): Promise<ProviderOrder>;

  /**
   * Verify the handshake the client SDK hands back after a successful payment.
   * This is the fast path; the webhook remains the source of truth.
   */
  verifyCheckoutSignature(input: {
    providerOrderId: string;
    providerPaymentId: string;
    signature: string;
  }): boolean;

  /** Server-side re-read of a payment — never trust client-reported amounts/status. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment>;

  /** Capture an authorized payment (no-op when the gateway auto-captures). */
  capture(providerPaymentId: string, amount: number, currency: string): Promise<ProviderPayment>;

  refund(providerPaymentId: string, input: RefundInput): Promise<ProviderRefund>;

  /** Verify + parse a webhook from its RAW body. Throws if the signature is bad. */
  verifyWebhook(rawBody: Buffer | string, headers: Record<string, string | undefined>): ProviderWebhookEvent;
}

/** Thrown when the gateway rejects a call — carries the gateway's own code. */
export class PaymentProviderError extends Error {
  constructor(
    public readonly providerCode: string,
    message: string,
    public readonly status = 502,
  ) {
    super(message);
    this.name = 'PaymentProviderError';
  }
}
