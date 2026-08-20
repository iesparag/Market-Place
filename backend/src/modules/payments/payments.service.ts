import type { HydratedDocument } from 'mongoose';
import { SOCKET_EVENTS } from '@app/shared';
import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { AppError } from '../../common/AppError.js';
import { Order, type OrderDoc } from '../orders/order.model.js';
import { User } from '../auth/user.model.js';
import { getSettings } from '../settings/settings.model.js';
import { emitToUser, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../notifications/notifications.module.js';
import {
  paymentProvider,
  MockPaymentProvider,
  PaymentProviderError,
  type ProviderPayment,
} from '../../providers/payment/index.js';
import { Payment, type PaymentMethod } from './payment.model.js';
import { settlementService } from './settlement.service.js';

type OrderRecord = HydratedDocument<OrderDoc>;
type PlatformSettings = Awaited<ReturnType<typeof getSettings>>;

/** What the client needs to open the gateway sheet. */
export interface CheckoutSession {
  paymentId: string;
  orderId: string;
  orderNumber: string;
  method: PaymentMethod;
  provider: string;
  /** Publishable gateway key (empty for COD). */
  publicKey: string;
  providerOrderId: string | null;
  amount: number;
  currency: string;
  brandName: string;
  brandLogo: string;
  prefill: { name: string; email: string; contact: string };
  /** COD needs no gateway round-trip — the client can go straight to the success screen. */
  requiresGateway: boolean;
}

export const paymentsService = {
  /**
   * Start (or resume) payment for an order.
   *
   * Resuming matters: a customer who closes the UPI sheet and taps "Pay" again must
   * land on the SAME gateway order, otherwise we leak abandoned orders and — worse —
   * two live gateway orders could both get paid for one cart.
   */
  async createCheckout(
    orderId: string,
    customerId: string,
    method: PaymentMethod,
  ): Promise<CheckoutSession> {
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');
    if (String(order.customerId) !== customerId) throw AppError.forbidden('Not your order');
    if (order.payment?.status === 'paid' || order.status === 'paid' || order.status === 'fulfilled')
      throw AppError.badRequest('ALREADY_PAID', 'This order is already paid');
    if (order.status === 'cancelled' || order.status === 'refunded')
      throw AppError.badRequest('ORDER_CLOSED', 'This order is no longer payable');

    const amount = order.amounts?.grandTotal ?? 0;
    if (amount <= 0) throw AppError.badRequest('BAD_AMOUNT', 'Order total must be greater than zero');

    const settings = await getSettings();
    const currency = order.currency ?? env.PAYMENT_CURRENCY;

    if (method === 'cod') return this.startCod(order, settings, currency);

    // The gateway in force decides the method — a client cannot ask for 'mock' in prod.
    const effectiveMethod: PaymentMethod = paymentProvider.name === 'mock' ? 'mock' : 'razorpay';

    // Reuse a still-open payment for this order+amount instead of creating another.
    const existing = await Payment.findOne({
      orderId,
      status: { $in: ['created', 'attempted'] },
      provider: paymentProvider.name,
      amount,
    }).sort({ createdAt: -1 });

    if (existing?.providerOrderId) {
      return this.toSession(order, existing.id as string, effectiveMethod, existing.providerOrderId, amount, currency);
    }

    const providerOrder = await paymentProvider.createOrder({
      amount,
      currency,
      receipt: order.orderNumber,
      notes: { orderId: String(order._id), orderNumber: order.orderNumber, customerId },
      idempotencyKey: `order:${String(order._id)}:${amount}`,
    });

    const payment = await Payment.create({
      orderId,
      orderNumber: order.orderNumber,
      customerId,
      storeIds: order.storeIds ?? [],
      provider: paymentProvider.name,
      method: effectiveMethod,
      providerOrderId: providerOrder.providerOrderId,
      amount,
      currency,
      status: 'created',
    });

    order.set({
      'payment.method': effectiveMethod,
      'payment.provider': paymentProvider.name,
      'payment.status': 'pending',
      'payment.paymentId': payment._id,
      'payment.providerOrderId': providerOrder.providerOrderId,
    });
    await order.save();

    return this.toSession(order, payment.id as string, effectiveMethod, providerOrder.providerOrderId, amount, currency);
  },

  /** Cash on delivery: no gateway, no ledger until the cash is actually collected. */
  async startCod(
    order: OrderRecord,
    settings: PlatformSettings,
    currency: string,
  ): Promise<CheckoutSession> {
    if (settings.codEnabled === false)
      throw AppError.badRequest('COD_DISABLED', 'Cash on delivery is not available right now');
    const amount = order.amounts?.grandTotal ?? 0;
    const cap = settings.codMaxOrderValue ?? 0;
    if (cap > 0 && amount > cap)
      throw AppError.badRequest(
        'COD_LIMIT',
        `Cash on delivery is available on orders up to ₹${cap / 100}. Please pay online.`,
      );

    const payment = await Payment.findOneAndUpdate(
      { orderId: order._id, method: 'cod' },
      {
        $setOnInsert: {
          orderId: order._id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          storeIds: order.storeIds ?? [],
          provider: 'cod',
          method: 'cod',
          amount,
          currency,
          status: 'created',
        },
      },
      { new: true, upsert: true },
    );

    order.set({
      'payment.method': 'cod',
      'payment.provider': 'cod',
      'payment.status': 'pending',
      'payment.paymentId': payment._id,
    });
    await order.save();

    return {
      paymentId: payment.id as string,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      method: 'cod',
      provider: 'cod',
      publicKey: '',
      providerOrderId: null,
      amount,
      currency,
      brandName: env.PAYMENT_BRAND_NAME,
      brandLogo: env.PAYMENT_BRAND_LOGO,
      prefill: await prefillFor(String(order.customerId), order),
      requiresGateway: false,
    };
  },

  async toSession(
    order: OrderRecord,
    paymentId: string,
    method: PaymentMethod,
    providerOrderId: string,
    amount: number,
    currency: string,
  ): Promise<CheckoutSession> {
    return {
      paymentId,
      orderId: String(order._id),
      orderNumber: order.orderNumber,
      method,
      provider: paymentProvider.name,
      publicKey: paymentProvider.publicKey,
      providerOrderId,
      amount,
      currency,
      brandName: env.PAYMENT_BRAND_NAME,
      brandLogo: env.PAYMENT_BRAND_LOGO,
      prefill: await prefillFor(String(order.customerId), order),
      requiresGateway: true,
    };
  },

  /**
   * Fast path: the client SDK handed back a signed success. We verify the signature,
   * then **re-read the payment from the gateway** — the client is never the source of
   * truth for status or amount.
   */
  async confirmFromClient(
    customerId: string,
    input: { providerOrderId: string; providerPaymentId: string; signature: string },
  ) {
    const payment = await Payment.findOne({ providerOrderId: input.providerOrderId });
    if (!payment) throw AppError.notFound('Payment not found');
    if (String(payment.customerId) !== customerId) throw AppError.forbidden('Not your payment');

    const valid = paymentProvider.verifyCheckoutSignature(input);
    if (!valid) {
      logger.warn({ providerOrderId: input.providerOrderId, customerId }, 'payment: bad checkout signature');
      throw AppError.badRequest('BAD_SIGNATURE', 'Payment could not be verified');
    }

    const gatewayPayment = await paymentProvider.fetchPayment(input.providerPaymentId);
    if (gatewayPayment.providerOrderId && gatewayPayment.providerOrderId !== input.providerOrderId)
      throw AppError.badRequest('MISMATCH', 'Payment does not belong to this order');
    if (gatewayPayment.amount < payment.amount)
      throw AppError.badRequest('UNDERPAID', 'Paid amount is less than the order total');

    if (gatewayPayment.status === 'authorized' && !gatewayPayment.captured) {
      const captured = await paymentProvider.capture(
        gatewayPayment.providerPaymentId,
        payment.amount,
        payment.currency ?? 'INR',
      );
      return this.applyGatewayPayment(captured, 'client');
    }
    if (gatewayPayment.status === 'failed') return this.applyGatewayPayment(gatewayPayment, 'client');
    if (!gatewayPayment.captured)
      throw AppError.badRequest('NOT_CAPTURED', 'Payment is still processing. We will confirm shortly.');

    return this.applyGatewayPayment(gatewayPayment, 'client');
  },

  /**
   * The one place a gateway payment becomes our truth — called by BOTH the client
   * confirmation and the webhook. Guarded by an atomic claim on the Payment row, so
   * whichever arrives second is a no-op.
   */
  async applyGatewayPayment(gatewayPayment: ProviderPayment, source: 'client' | 'webhook') {
    const payment = await Payment.findOne(
      gatewayPayment.providerOrderId
        ? { providerOrderId: gatewayPayment.providerOrderId }
        : { providerPaymentId: gatewayPayment.providerPaymentId },
    );
    if (!payment) {
      logger.warn({ gatewayPayment, source }, 'payment: gateway event for an unknown payment');
      return null;
    }

    if (gatewayPayment.status === 'failed' || (!gatewayPayment.captured && gatewayPayment.status !== 'captured')) {
      return this.markFailed(payment.id as string, {
        providerPaymentId: gatewayPayment.providerPaymentId,
        method: gatewayPayment.method,
        errorCode: gatewayPayment.errorCode,
        errorDescription: gatewayPayment.errorDescription,
      });
    }

    // Atomic claim — only the first caller flips created/attempted → paid.
    const claimed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: { $in: ['created', 'attempted', 'failed'] } },
      {
        $set: {
          status: 'paid',
          providerPaymentId: gatewayPayment.providerPaymentId,
          amountPaid: gatewayPayment.amount,
          paidAt: new Date(),
        },
        $push: {
          attempts: {
            at: new Date(),
            providerPaymentId: gatewayPayment.providerPaymentId,
            status: 'captured',
            method: gatewayPayment.method,
          },
        },
      },
      { new: true },
    );

    if (!claimed) {
      logger.info({ paymentId: String(payment._id), source }, 'payment: already applied — no-op');
      return payment;
    }

    await settlementService.settlePrepaid(String(claimed.orderId), {
      paymentId: String(claimed._id),
      provider: claimed.provider,
      method: claimed.method,
      providerOrderId: claimed.providerOrderId ?? undefined,
      providerPaymentId: gatewayPayment.providerPaymentId,
    });
    logger.info(
      { orderId: String(claimed.orderId), paymentId: String(claimed._id), source, amount: gatewayPayment.amount },
      'payment: settled',
    );
    return claimed;
  },

  /** Record a failed attempt. The order stays payable so the customer can retry. */
  async markFailed(
    paymentId: string,
    detail: { providerPaymentId?: string; method?: string; errorCode?: string; errorDescription?: string },
  ) {
    const payment = await Payment.findOneAndUpdate(
      { _id: paymentId, status: { $in: ['created', 'attempted'] } },
      {
        $set: {
          status: 'attempted', // stays retryable — 'failed' is only for an abandoned order
          failedAt: new Date(),
          failureReason: detail.errorDescription ?? detail.errorCode ?? 'Payment failed',
        },
        $push: {
          attempts: {
            at: new Date(),
            providerPaymentId: detail.providerPaymentId,
            status: 'failed',
            method: detail.method,
            errorCode: detail.errorCode,
            errorDescription: detail.errorDescription,
          },
        },
      },
      { new: true },
    );
    if (!payment) return null;

    await Order.updateOne(
      { _id: payment.orderId, 'payment.status': { $ne: 'paid' } },
      { $set: { 'payment.status': 'failed' } },
    );

    const customerId = String(payment.customerId);
    const at = new Date().toISOString();
    safeEmit(() =>
      emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
        orderId: String(payment.orderId),
        status: 'pending',
        at,
      }),
    );
    void notify(customerId, {
      type: 'payment',
      title: 'Payment failed',
      body: `${payment.orderNumber ?? ''} · ${payment.failureReason ?? 'Please try again'}`,
      link: `/order/${String(payment.orderId)}`,
    });
    return payment;
  },

  /**
   * Refund a paid order (full or partial). The gateway call carries an idempotency
   * key derived from the order + amount already refunded, so a double-click cannot
   * send the money twice.
   */
  async refund(
    orderId: string,
    input: { amount?: number; reason?: string; actorId?: string },
  ) {
    const order = await Order.findById(orderId);
    if (!order) throw AppError.notFound('Order not found');
    // `partially_refunded` must stay refundable — a second partial refund is normal
    // (e.g. one damaged item today, another returned next week).
    if (order.payment?.status !== 'paid' && order.payment?.status !== 'partially_refunded')
      throw AppError.badRequest(
        'NOT_PAID',
        order.payment?.status === 'refunded'
          ? 'This order has already been fully refunded'
          : 'Only a paid order can be refunded',
      );

    const payment = await Payment.findOne({ orderId, status: { $in: ['paid', 'partially_refunded'] } });
    if (!payment) throw AppError.badRequest('NO_PAYMENT', 'No settled payment found for this order');

    const alreadyRefunded = payment.refundedAmount ?? 0;
    const refundable = (payment.amountPaid || payment.amount) - alreadyRefunded;
    const amount = input.amount ?? refundable;
    if (amount <= 0) throw AppError.badRequest('BAD_AMOUNT', 'Refund amount must be greater than zero');
    if (amount > refundable)
      throw AppError.badRequest('REFUND_TOO_LARGE', `Only ₹${refundable / 100} can still be refunded`);

    let refundRef: string;
    let refundStatus = 'processed';

    if (payment.method === 'cod') {
      // Nothing was collected through us — this only reverses the accounting.
      refundRef = `cod:${orderId}:${alreadyRefunded + amount}`;
    } else {
      if (!payment.providerPaymentId)
        throw AppError.badRequest('NO_GATEWAY_PAYMENT', 'This payment has no gateway reference to refund');
      try {
        const r = await paymentProvider.refund(payment.providerPaymentId, {
          amount,
          notes: { orderId, orderNumber: order.orderNumber, reason: input.reason ?? '' },
          idempotencyKey: `refund:${orderId}:${alreadyRefunded + amount}`,
        });
        refundRef = r.refundId;
        refundStatus = r.status;
      } catch (e) {
        if (e instanceof PaymentProviderError)
          throw new AppError('REFUND_FAILED', e.status === 400 ? 400 : 502, e.message);
        throw e;
      }
    }

    const totalRefunded = alreadyRefunded + amount;
    const fullyRefunded = totalRefunded >= (payment.amountPaid || payment.amount);

    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: { refundedAmount: totalRefunded, status: fullyRefunded ? 'refunded' : 'partially_refunded' },
        $push: {
          refunds: {
            at: new Date(),
            refundId: refundRef,
            amount,
            status: refundStatus,
            reason: input.reason,
            ...(input.actorId ? { by: input.actorId } : {}),
          },
        },
      },
    );

    await settlementService.settleRefund(orderId, { amount, refundRef, reason: input.reason });

    order.set({
      status: fullyRefunded ? 'refunded' : order.status,
      'payment.status': fullyRefunded ? 'refunded' : 'partially_refunded',
      'payment.refundedAmount': totalRefunded,
    });
    await order.save();

    const customerId = String(order.customerId);
    safeEmit(() =>
      emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
        orderId,
        status: fullyRefunded ? 'refunded' : 'paid',
        at: new Date().toISOString(),
      }),
    );
    void notify(customerId, {
      type: 'payment',
      title: 'Refund processed ↩️',
      body: `${order.orderNumber} · ₹${amount / 100} is on its way back (3–5 working days)`,
      link: `/order/${orderId}`,
    });

    return { orderId, refundId: refundRef, amount, totalRefunded, fullyRefunded, status: refundStatus };
  },

  /** Payment state for one order — what the customer's order screen polls. */
  async statusForOrder(orderId: string, customerId?: string) {
    const order = await Order.findById(orderId).lean();
    if (!order) throw AppError.notFound('Order not found');
    if (customerId && String(order.customerId) !== customerId) throw AppError.forbidden('Not your order');
    const payment = await Payment.findOne({ orderId }).sort({ createdAt: -1 }).lean();
    return {
      orderId,
      orderStatus: order.status,
      paymentStatus: order.payment?.status ?? 'unpaid',
      method: order.payment?.method ?? null,
      amount: order.amounts?.grandTotal ?? 0,
      paidAt: order.payment?.paidAt ?? null,
      refundedAmount: order.payment?.refundedAmount ?? 0,
      lastFailure: payment?.failureReason ?? null,
      providerOrderId: payment?.providerOrderId ?? null,
    };
  },

  /** Dev-only: simulate the gateway sheet succeeding when running on the mock provider. */
  async mockPay(customerId: string, providerOrderId: string) {
    if (!(paymentProvider instanceof MockPaymentProvider))
      throw AppError.forbidden('Mock payments are disabled — a live gateway is configured');
    const payment = await Payment.findOne({ providerOrderId });
    if (!payment) throw AppError.notFound('Payment not found');
    if (String(payment.customerId) !== customerId) throw AppError.forbidden('Not your payment');
    const { providerPaymentId, signature } = await paymentProvider.simulateSuccess(providerOrderId);
    return { providerOrderId, providerPaymentId, signature };
  },
};

/** Gateway sheets pre-fill name/email/phone — fewer taps, higher conversion. */
async function prefillFor(
  customerId: string,
  order: { contact?: { name?: string | null; phone?: string | null; email?: string | null } | null },
): Promise<{ name: string; email: string; contact: string }> {
  const user = await User.findById(customerId).select('name email phone').lean();
  return {
    name: order.contact?.name ?? user?.name ?? '',
    email: order.contact?.email ?? user?.email ?? '',
    contact: order.contact?.phone ?? (user as { phone?: string } | null)?.phone ?? '',
  };
}
