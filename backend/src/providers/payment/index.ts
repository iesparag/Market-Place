import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { MockPaymentProvider } from './mock.provider.js';
import { RazorpayProvider } from './razorpay.provider.js';
import type { PaymentProvider } from './types.js';

export * from './types.js';
export { MockPaymentProvider } from './mock.provider.js';
export { RazorpayProvider } from './razorpay.provider.js';

/**
 * Resolve the gateway once at boot.
 *  - PAYMENT_PROVIDER=auto (default) → Razorpay when both keys are set, else the dev mock.
 *  - PAYMENT_PROVIDER=razorpay       → Razorpay, and the app refuses to boot without keys.
 *  - PAYMENT_PROVIDER=mock           → always the keyless dev gateway.
 */
function resolveProvider(): PaymentProvider {
  const hasKeys = Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  const want = env.PAYMENT_PROVIDER === 'auto' ? (hasKeys ? 'razorpay' : 'mock') : env.PAYMENT_PROVIDER;

  if (want === 'razorpay') {
    if (!hasKeys) {
      logger.error('PAYMENT_PROVIDER=razorpay but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are missing');
      process.exit(1);
    }
    if (!env.RAZORPAY_WEBHOOK_SECRET) {
      // Not fatal: checkout still works via the signed client handshake, but the
      // webhook (the source of truth for async methods like UPI collect) is deaf.
      logger.warn('RAZORPAY_WEBHOOK_SECRET is not set — webhooks will be rejected. Set it before going live.');
    }
    logger.info('Payments: Razorpay (live gateway)');
    return new RazorpayProvider(
      env.RAZORPAY_KEY_ID!,
      env.RAZORPAY_KEY_SECRET!,
      env.RAZORPAY_WEBHOOK_SECRET ?? '',
    );
  }

  logger.warn('Payments: MOCK gateway (no Razorpay keys) — real money is never moved');
  return new MockPaymentProvider();
}

export const paymentProvider: PaymentProvider = resolveProvider();

/** True when a real gateway is wired — used to gate dev-only endpoints. */
export const isLiveGateway = paymentProvider.live;
