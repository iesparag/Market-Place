/**
 * Payment provider abstraction (marketplace split settlement).
 * Reference impl target: Stripe Connect. Swap for Razorpay Route / Selcom.
 * See docs/05-PAYMENTS.md.
 */
export interface PaymentIntentResult {
  intentId: string;
  clientSecret: string;
}
export interface PaymentProvider {
  createPaymentIntent(input: { amount: number; currency: string; orderId: string }): Promise<PaymentIntentResult>;
  refund(chargeId: string, amount: number): Promise<{ refundId: string }>;
  verifyWebhook(rawBody: string, signature: string): { id: string; type: string; data: unknown };
}

/** Placeholder impl so the app compiles; real Stripe wiring comes in Phase 3. */
export const stubPaymentProvider: PaymentProvider = {
  async createPaymentIntent(input) {
    return { intentId: `pi_stub_${input.orderId}`, clientSecret: 'stub_secret' };
  },
  async refund(chargeId) {
    return { refundId: `re_stub_${chargeId}` };
  },
  verifyWebhook(_rawBody, _signature) {
    throw new Error('Payment webhook verification not implemented (Phase 3)');
  },
};

export const paymentProvider: PaymentProvider = stubPaymentProvider;
