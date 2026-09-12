import type { HydratedDocument } from 'mongoose';
import { SOCKET_EVENTS } from '@app/shared';
import { logger } from '../../config/logger.js';
import { sum, percentOf } from '../../common/money.js';
import { Order, type OrderDoc } from '../orders/order.model.js';
import { Store } from '../stores/store.model.js';
import { getSettings } from '../settings/settings.model.js';
import { ledgerService, type LedgerEntryInput } from '../ledger/ledger.service.js';
import { emitToStore, emitToUser, emitToAdmin, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../notifications/notifications.module.js';
import { sendOrderEmail } from '../orders/order-email.js';

type OrderRecord = HydratedDocument<OrderDoc>;

export interface CommissionSnapshot {
  storeId: string;
  subtotal: number;
  rate: number;
  amount: number;
  payable: number;
}

/**
 * Settlement = turning a payment event into ledger truth.
 *
 * Two hard rules, both enforced here and nowhere else:
 *  1. **Atomic claim.** The order is moved out of its pre-paid state with a single
 *     conditional `findOneAndUpdate`. Whoever loses the race gets `null` and returns
 *     without writing anything — so a webhook and a client callback arriving together
 *     settle exactly once.
 *  2. **Keyed ledger writes.** Every entry carries a deterministic `idempotencyKey`,
 *     so even a replayed settle cannot double-post.
 */
export const settlementService = {
  /**
   * Prepaid order (Razorpay/mock) captured → order becomes `paid`, vendors accrue.
   * Returns the settled order, or `null` if another caller already settled it.
   */
  async settlePrepaid(
    orderId: string,
    ctx: { paymentId?: string; provider: string; method: string; providerOrderId?: string; providerPaymentId?: string },
  ): Promise<OrderRecord | null> {
    const now = new Date();
    // Atomic claim: only an order that is still awaiting payment can be settled.
    const order = await Order.findOneAndUpdate(
      { _id: orderId, status: 'pending', 'payment.status': { $ne: 'paid' } },
      {
        $set: {
          status: 'paid',
          'payment.method': ctx.method,
          'payment.provider': ctx.provider,
          'payment.status': 'paid',
          'payment.paidAt': now,
          ...(ctx.paymentId ? { 'payment.paymentId': ctx.paymentId } : {}),
          ...(ctx.providerOrderId ? { 'payment.providerOrderId': ctx.providerOrderId } : {}),
          ...(ctx.providerPaymentId ? { 'payment.providerPaymentId': ctx.providerPaymentId } : {}),
        },
      },
      { new: true },
    );
    if (!order) {
      logger.info({ orderId }, 'settlePrepaid: order already settled or not payable — no-op');
      return null;
    }

    const settings = await getSettings();
    const snapshots = await computeCommissions(order);
    const availableAt = new Date(now.getTime() + (settings.payoutHoldDays ?? 0) * 86_400_000);

    const entries: LedgerEntryInput[] = [
      // We collected the full grand total.
      {
        orderId,
        account: 'platform_cash',
        amount: order.amounts?.grandTotal ?? 0,
        idempotencyKey: `pay:${orderId}:cash`,
        refType: 'payment',
        refId: ctx.providerPaymentId ?? ctx.paymentId,
      },
    ];
    for (const s of snapshots) {
      entries.push(
        {
          orderId,
          storeId: s.storeId,
          account: 'vendor_payable',
          amount: s.payable,
          availableAt, // held until the payout window opens
          idempotencyKey: `pay:${orderId}:${s.storeId}:payable`,
          refType: 'order',
          refId: order.orderNumber,
        },
        {
          orderId,
          storeId: s.storeId,
          account: 'commission_income',
          amount: s.amount,
          idempotencyKey: `pay:${orderId}:${s.storeId}:commission`,
          refType: 'order',
          refId: order.orderNumber,
        },
      );
    }

    await ledgerService.post(entries);
    order.set({ commissions: snapshots });
    await order.save();

    announcePaid(order, snapshots);
    void sendOrderEmail(order, 'paid');
    return order;
  },

  /**
   * COD order delivered → the *vendor* holds the cash, so the platform is owed its
   * commission. We credit commission income and post a NEGATIVE vendor_payable, which
   * nets off against the vendor's prepaid earnings at the next payout.
   */
  async settleCodCollected(orderId: string): Promise<OrderRecord | null> {
    const now = new Date();
    const order = await Order.findOneAndUpdate(
      { _id: orderId, 'payment.method': 'cod', 'payment.status': { $nin: ['paid', 'refunded'] } },
      { $set: { 'payment.status': 'paid', 'payment.paidAt': now, 'payment.collectedAt': now } },
      { new: true },
    );
    if (!order) return null;

    const snapshots = await computeCommissions(order);
    const entries: LedgerEntryInput[] = [];
    for (const s of snapshots) {
      entries.push(
        {
          orderId,
          storeId: s.storeId,
          account: 'commission_income',
          amount: s.amount,
          idempotencyKey: `cod:${orderId}:${s.storeId}:commission`,
          refType: 'order',
          refId: order.orderNumber,
        },
        {
          orderId,
          storeId: s.storeId,
          account: 'vendor_payable',
          amount: -s.amount, // vendor already has the cash; they owe us the cut
          availableAt: now,
          note: 'COD commission due from vendor',
          idempotencyKey: `cod:${orderId}:${s.storeId}:commission_due`,
          refType: 'order',
          refId: order.orderNumber,
        },
      );
    }
    await ledgerService.post(entries);
    order.set({ commissions: snapshots });
    await order.save();
    return order;
  },

  /**
   * Reverse a settled order (full or partial refund).
   * Clawback is proportional so a ₹200 refund on a ₹1000 order returns 20% of both
   * the vendor payable and our commission.
   */
  async settleRefund(
    orderId: string,
    input: { amount: number; refundRef: string; reason?: string },
  ): Promise<void> {
    const order = await Order.findById(orderId).lean();
    if (!order) return;
    const grandTotal = order.amounts?.grandTotal ?? 0;
    if (grandTotal <= 0) return;

    const ratio = Math.min(1, input.amount / grandTotal);
    const isCod = order.payment?.method === 'cod';
    const entries: LedgerEntryInput[] = [
      {
        orderId,
        account: 'refund',
        amount: input.amount,
        idempotencyKey: `refund:${input.refundRef}:refund`,
        refType: 'refund',
        refId: input.refundRef,
        note: input.reason,
      },
      {
        orderId,
        account: 'platform_cash',
        amount: isCod ? 0 : -input.amount, // COD cash never entered our account
        idempotencyKey: `refund:${input.refundRef}:cash`,
        refType: 'refund',
        refId: input.refundRef,
      },
    ];

    for (const c of order.commissions ?? []) {
      const storeId = String(c.storeId);
      const payableBack = Math.round((c.payable ?? 0) * ratio);
      const commissionBack = Math.round((c.amount ?? 0) * ratio);
      entries.push(
        {
          orderId,
          storeId,
          account: 'vendor_payable',
          amount: isCod ? commissionBack : -payableBack, // COD: undo the commission-due debit
          availableAt: new Date(),
          idempotencyKey: `refund:${input.refundRef}:${storeId}:payable`,
          refType: 'refund',
          refId: input.refundRef,
        },
        {
          orderId,
          storeId,
          account: 'commission_income',
          amount: -commissionBack,
          idempotencyKey: `refund:${input.refundRef}:${storeId}:commission`,
          refType: 'refund',
          refId: input.refundRef,
        },
      );
    }

    await ledgerService.post(entries.filter((e) => e.amount !== 0));
  },
};

/**
 * Per-store subtotal → commission → payable, using the store override when present
 * and the platform default otherwise. Snapshotted onto the order so a later rate
 * change never rewrites history.
 */
export async function computeCommissions(order: {
  items: { storeId: unknown; lineTotal: number }[];
  amounts?: { itemsTotal?: number | null; discount?: number | null; tax?: number | null; delivery?: number | null } | null;
}): Promise<CommissionSnapshot[]> {
  const settings = await getSettings();
  const defaultRate = settings.commissionPercent;
  const storeIds = [...new Set(order.items.map((i) => String(i.storeId)))];
  const itemsTotal = sum(order.items.map((i) => i.lineTotal));
  const discount = order.amounts?.discount ?? 0;

  const snapshots: CommissionSnapshot[] = [];
  for (const storeId of storeIds) {
    const gross = sum(order.items.filter((i) => String(i.storeId) === storeId).map((i) => i.lineTotal));
    // Order-level discount is shared across vendors in proportion to their basket share.
    const share = itemsTotal > 0 ? gross / itemsTotal : 0;
    const subtotal = gross - Math.round(discount * share);

    const store = await Store.findById(storeId).select('commissionOverride').lean();
    const override = store?.commissionOverride;
    const isPercent = override?.type === 'percent' && typeof override.value === 'number';
    const isFlat = override?.type === 'flat' && typeof override.value === 'number';

    const rate = isPercent ? override.value! : defaultRate;
    const commission = isFlat ? Math.min(override.value!, subtotal) : percentOf(subtotal, rate);
    snapshots.push({
      storeId,
      subtotal,
      rate: isFlat ? 0 : rate,
      amount: commission,
      payable: subtotal - commission,
    });
  }
  return snapshots;
}

/** Live push + bell notification for everyone who cares that an order is paid. */
function announcePaid(order: OrderRecord, snapshots: CommissionSnapshot[]): void {
  const at = new Date().toISOString();
  const orderId = String(order._id);
  const customerId = String(order.customerId);
  const total = (order.amounts?.grandTotal ?? 0) / 100;

  safeEmit(() => emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, { orderId, status: 'paid', at }));
  safeEmit(() =>
    emitToAdmin(SOCKET_EVENTS.NOTIFICATION_NEW, {
      id: orderId,
      title: 'Payment received 💰',
      body: `${order.orderNumber} · ₹${total}`,
      at,
    }),
  );
  for (const s of snapshots) {
    safeEmit(() =>
      emitToStore(s.storeId, SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: orderId,
        title: 'Paid order — start fulfilment 💰',
        body: `${order.orderNumber} · your share ₹${s.payable / 100}`,
        at,
      }),
    );
  }
  void notify(customerId, {
    type: 'payment',
    title: 'Payment successful 💰',
    body: `${order.orderNumber} · ₹${total}`,
    link: `/order/${orderId}`,
  });
}
