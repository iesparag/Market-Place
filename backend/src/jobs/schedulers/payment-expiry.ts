import { SOCKET_EVENTS } from '@app/shared';
import { logger } from '../../config/logger.js';
import { Order } from '../../modules/orders/order.model.js';
import { Product } from '../../modules/products/product.model.js';
import { Payment } from '../../modules/payments/payment.model.js';
import { getSettings } from '../../modules/settings/settings.model.js';
import { emitToUser, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../../modules/notifications/notifications.module.js';
import { sendOrderEmail } from '../../modules/orders/order-email.js';

const SWEEP_INTERVAL_MS = 5 * 60_000; // every 5 minutes

/**
 * Release stock held by orders that were placed but never paid.
 *
 * Placing an order decrements stock immediately. Before real payments existed every
 * order was paid instantly, so nothing was ever left hanging; now a customer can
 * abandon the gateway sheet and silently hold inventory forever. This sweeper gives
 * that stock back.
 *
 * Deliberately conservative:
 *  - COD orders are never touched — they are legitimately unpaid until delivery.
 *  - Only `pending` + unpaid orders past the grace window are eligible.
 *  - The cancel is an atomic claim, so a payment landing at the same moment wins
 *    (the order flips to `paid` and the sweeper's update matches nothing).
 */
export async function expireUnpaidOrders(now = new Date()): Promise<number> {
  const settings = await getSettings();
  const graceMinutes = settings.paymentExpiryMinutes ?? 30;
  if (graceMinutes <= 0) return 0;

  const cutoff = new Date(now.getTime() - graceMinutes * 60_000);
  const stale = await Order.find({
    status: 'pending',
    createdAt: { $lt: cutoff },
    'payment.status': { $nin: ['paid', 'refunded', 'partially_refunded'] },
    'payment.method': { $ne: 'cod' },
  })
    .limit(200)
    .lean();

  let expired = 0;
  for (const order of stale) {
    const orderId = String(order._id);

    // Atomic claim — if a webhook settles this order right now, this matches nothing.
    const claimed = await Order.findOneAndUpdate(
      { _id: order._id, status: 'pending', 'payment.status': { $ne: 'paid' } },
      { $set: { status: 'cancelled', 'payment.status': 'failed' } },
      { new: true },
    );
    if (!claimed) continue;

    for (const line of order.items ?? []) {
      await Product.updateOne(
        { _id: line.productId, 'variants.sku': line.variantSku },
        { $inc: { 'variants.$.stock': line.qty, salesCount: -line.qty } },
      );
    }
    await Payment.updateOne(
      { orderId: order._id, status: { $in: ['created', 'attempted'] } },
      { $set: { status: 'failed', failedAt: new Date(), failureReason: 'Payment not completed in time' } },
    );

    const customerId = String(order.customerId);
    safeEmit(() =>
      emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
        orderId,
        status: 'cancelled',
        at: new Date().toISOString(),
      }),
    );
    void notify(customerId, {
      type: 'order',
      title: 'Order cancelled — payment not completed',
      body: `${order.orderNumber} was cancelled because payment wasn't completed. Your items are back in stock.`,
      link: '/account/orders',
    });
    void sendOrderEmail(order, 'payment_expired');
    expired += 1;
  }

  if (expired > 0) logger.info({ expired, graceMinutes }, 'payment-expiry: released stock from unpaid orders');
  return expired;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the sweeper. Safe to call once at boot; a second call is a no-op. */
export function startPaymentExpirySweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void expireUnpaidOrders().catch((err) => logger.error({ err }, 'payment-expiry: sweep failed'));
  }, SWEEP_INTERVAL_MS);
  // Never hold the process open just for this.
  timer.unref?.();
  logger.info('Payment expiry sweeper started');
}

export function stopPaymentExpirySweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
