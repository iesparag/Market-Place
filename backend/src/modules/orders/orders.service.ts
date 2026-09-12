import { SOCKET_EVENTS, type OrderStatusUpdated } from '@app/shared';
import { AppError } from '../../common/AppError.js';
import { sum, percentOf } from '../../common/money.js';
import { Product } from '../products/product.model.js';
import { Store } from '../stores/store.model.js';
import { Order } from './order.model.js';
import { getSettings } from '../settings/settings.model.js';
import { paymentProvider } from '../../providers/payment/index.js';
import { paymentsService } from '../payments/payments.service.js';
import { settlementService } from '../payments/settlement.service.js';
import { computeDiscount, markCouponUsed } from '../coupons/coupons.module.js';
import { emitToStore, emitToUser, emitToAdmin, safeEmit } from '../../realtime/emitters.js';
import { notify } from '../notifications/notifications.module.js';
import { sendOrderEmail, type NotifiableOrder } from './order-email.js';

const NEXT_STATUS = ['pending', 'paid', 'fulfilled', 'cancelled'] as const;
export type OrderStatus = (typeof NEXT_STATUS)[number];

export interface OrderItemInput {
  productId: string;
  variantSku: string;
  qty: number;
  modifierNames?: string[];
}
export interface CreateOrderInput {
  items: OrderItemInput[];
  couponCode?: string;
  contact?: { name?: string; phone?: string; email?: string };
  shippingAddress?: { line1?: string; city?: string; pincode?: string };
}

function orderNumber(): string {
  return `ORD-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

export const ordersService = {
  /** Rebuild every line price from the DB. The client price is never trusted. */
  async create(customerId: string, input: CreateOrderInput) {
    if (!input.items?.length) throw AppError.badRequest('EMPTY_CART', 'Cart is empty');

    const lines = [];
    const lowStockAlerts: { storeId: string; productId: string; variantSku: string; stock: number }[] = [];
    // Cache per store so a multi-line cart from one vendor doesn't re-query their status.
    const storeStatusCache = new Map<string, string>();
    for (const item of input.items) {
      const product = await Product.findById(item.productId).lean();
      if (!product) throw AppError.notFound(`Product ${item.productId} not found`);
      if (product.status !== 'active' || product.visibility !== 'public')
        throw AppError.badRequest('PRODUCT_UNAVAILABLE', `${product.title} is no longer available`);

      const storeIdStr = String(product.storeId);
      let storeStatus = storeStatusCache.get(storeIdStr);
      if (storeStatus === undefined) {
        const store = await Store.findById(product.storeId).select('status').lean();
        storeStatus = store?.status ?? 'missing';
        storeStatusCache.set(storeIdStr, storeStatus);
      }
      // A store can go from approved → suspended after items were added to a cart; re-check
      // at order time so a suspended vendor can never be paid, not just hidden from browsing.
      if (storeStatus !== 'approved')
        throw AppError.badRequest('VENDOR_UNAVAILABLE', `${product.title} is currently unavailable`);

      const variant = product.variants.find((v) => v.sku === item.variantSku);
      if (!variant) throw AppError.badRequest('VARIANT_NOT_FOUND', 'Variant not found');
      if (item.qty < 1) throw AppError.badRequest('BAD_QTY', 'Quantity must be >= 1');
      if (variant.trackInventory !== false && variant.stock < item.qty)
        throw AppError.badRequest('INSUFFICIENT_STOCK', `${product.title}: only ${variant.stock} in stock`);
      const remaining = variant.stock - item.qty;
      if (variant.trackInventory !== false && remaining <= 5)
        lowStockAlerts.push({ storeId: String(product.storeId), productId: String(product._id), variantSku: variant.sku, stock: remaining });

      // Resolve selected modifiers against the product definition (server truth).
      const chosen: { name: string; priceDelta: number }[] = [];
      for (const name of item.modifierNames ?? []) {
        for (const group of product.modifierGroups) {
          const opt = group.options.find((o) => o.name === name);
          if (opt) chosen.push({ name: opt.name, priceDelta: opt.priceDelta });
        }
      }
      const unitPrice = variant.price + sum(chosen.map((m) => m.priceDelta));
      lines.push({
        productId: product._id,
        storeId: product.storeId,
        title: product.title,
        variantSku: variant.sku,
        variantLabel: Object.values(variant.optionValues ?? {}).join(' / '),
        qty: item.qty,
        unitPrice,
        modifiers: chosen,
        lineTotal: unitPrice * item.qty,
      });
    }

    const itemsTotal = sum(lines.map((l) => l.lineTotal));
    const storeIds = [...new Set(lines.map((l) => String(l.storeId)))];

    // Coupon (optional) → tax → delivery. grandTotal = (items − discount) + tax + delivery.
    const settings = await getSettings();
    let discount = 0;
    let couponCode: string | undefined;
    if (input.couponCode) {
      const c = await computeDiscount(input.couponCode, itemsTotal);
      discount = c.discount;
      couponCode = c.code;
    }
    const taxable = itemsTotal - discount;
    const tax = percentOf(taxable, settings.taxPercent ?? 5);
    const delivery = itemsTotal >= (settings.freeDeliveryAbove ?? 50000) ? 0 : settings.deliveryFee ?? 4000;
    const grandTotal = taxable + tax + delivery;

    const order = await Order.create({
      orderNumber: orderNumber(),
      customerId,
      items: lines,
      storeIds,
      couponCode,
      amounts: { itemsTotal, discount, tax, delivery, grandTotal },
      contact: input.contact,
      shippingAddress: input.shippingAddress,
      status: 'pending',
    });
    if (couponCode) await markCouponUsed(couponCode);

    // Decrement stock per variant + bump salesCount for popularity (best-effort; real atomic reservation comes with inventory module).
    for (const l of lines) {
      await Product.updateOne(
        { _id: l.productId, 'variants.sku': l.variantSku },
        { $inc: { 'variants.$.stock': -l.qty, salesCount: l.qty } },
      );
    }

    // Realtime: notify each vendor store + the admins.
    const at = new Date().toISOString();
    for (const storeId of storeIds) {
      const count = lines.filter((l) => String(l.storeId) === storeId).length;
      safeEmit(() =>
        emitToStore(storeId, SOCKET_EVENTS.SUBORDER_NEW, {
          subOrderId: String(order._id),
          storeId,
          orderNumber: order.orderNumber,
          itemsCount: count,
          at,
        }),
      );
    }
    safeEmit(() =>
      emitToAdmin(SOCKET_EVENTS.NOTIFICATION_NEW, {
        id: String(order._id),
        title: 'New order',
        body: `${order.orderNumber} · ₹${itemsTotal / 100}`,
        at,
      }),
    );
    // Low-stock alerts to the vendor.
    for (const a of lowStockAlerts) {
      safeEmit(() =>
        emitToStore(a.storeId, SOCKET_EVENTS.INVENTORY_CHANGED, {
          productId: a.productId, variantSku: a.variantSku, stock: a.stock, at,
        }),
      );
    }
    // No customer-facing confirmation here — the order isn't a commitment yet, just a
    // draft awaiting payment. COD confirms at `paymentsService.startCod` (no gateway step
    // needed); prepaid confirms at `settlementService.settlePrepaid` (once actually paid).
    // Sending "Order placed" this early is what caused customers to get a confirmation
    // email for carts they never finished paying for.

    return order;
  },

  /** Update order status. Vendors may only touch orders that include their store. */
  async updateStatus(
    id: string,
    status: OrderStatus,
    actor: { role: string; storeId?: string },
  ) {
    const order = await Order.findById(id);
    if (!order) throw AppError.notFound('Order not found');
    const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
    if (isStoreScoped) {
      const owns = (order.storeIds ?? []).some((s) => String(s) === actor.storeId);
      if (!owns) throw AppError.forbidden('Not your order');
    }
    // Guard the money-bearing transition: an unpaid prepaid order must never be
    // walked forward to `paid` by hand — only the settlement service does that.
    if (status === 'paid' && order.payment?.status !== 'paid')
      throw AppError.badRequest(
        'NOT_PAID',
        'This order has not been paid. Collect payment before marking it paid.',
      );

    order.status = status;
    await order.save();

    // Cash on delivery: the money exists only once the order is handed over, so this
    // is where COD commission hits the ledger.
    if (status === 'fulfilled' && order.payment?.method === 'cod' && order.payment?.status !== 'paid') {
      await settlementService.settleCodCollected(id);
    }

    pushOrderStatus(order); // live socket + bell notification
    return order;
  },

  /** Manually re-emit the current status (socket + notification) — for when a push got missed
   *  (server restart / socket hiccup). Does not change the order. */
  async resendStatus(id: string, actor: { role: string; storeId?: string }) {
    const order = await Order.findById(id);
    if (!order) throw AppError.notFound('Order not found');
    const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
    if (isStoreScoped) {
      const owns = (order.storeIds ?? []).some((s) => String(s) === actor.storeId);
      if (!owns) throw AppError.forbidden('Not your order');
    }
    pushOrderStatus(order, true);
    return { resent: true, status: order.status };
  },

  /**
   * Legacy one-shot pay endpoint.
   *
   * This used to mark an order paid with no money attached — which is free checkout
   * the moment a real gateway exists. It is now a **dev-only** convenience that works
   * exclusively on the keyless mock gateway. With Razorpay configured, clients must go
   * through `POST /payments/checkout` → gateway sheet → `POST /payments/confirm`.
   */
  async pay(id: string, customerId: string) {
    if (paymentProvider.live)
      throw AppError.badRequest(
        'USE_PAYMENT_FLOW',
        'Direct pay is disabled. Start a payment with POST /payments/checkout.',
      );

    const session = await paymentsService.createCheckout(id, customerId, 'mock');
    if (!session.providerOrderId) throw AppError.badRequest('NO_SESSION', 'Could not start a mock payment');
    const handshake = await paymentsService.mockPay(customerId, session.providerOrderId);
    await paymentsService.confirmFromClient(customerId, handshake);
    return this.getById(id);
  },

  /** Customer cancels their own PENDING (unpaid) order → restock. */
  async cancel(id: string, customerId: string) {
    const order = await Order.findById(id);
    if (!order) throw AppError.notFound('Order not found');
    if (String(order.customerId) !== customerId) throw AppError.forbidden('Not your order');
    if (order.status !== 'pending') throw AppError.badRequest('CANNOT_CANCEL', 'Only pending orders can be cancelled');
    order.status = 'cancelled';
    await order.save();
    await restock(order.items);
    safeEmit(() =>
      emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, { orderId: id, status: 'cancelled', at: new Date().toISOString() }),
    );
    void notifyOrder(order, 'cancelled');
    return order;
  },

  /**
   * Refund a PAID order (admin, or the vendor whose store is on it).
   * The money movement + ledger reversal live in the payments service; this only
   * enforces scope and puts the stock back.
   */
  async refund(id: string, actor: { role: string; storeId?: string; id?: string }) {
    const order = await Order.findById(id);
    if (!order) throw AppError.notFound('Order not found');
    const isStoreScoped = actor.role === 'vendor' || actor.role === 'vendor_staff';
    if (isStoreScoped && !(order.storeIds ?? []).some((s) => String(s) === actor.storeId))
      throw AppError.forbidden('Not your order');

    await paymentsService.refund(id, { reason: 'Refunded from order screen', actorId: actor.id });
    await restock(order.items);
    const updated = await Order.findById(id);
    if (updated) void notifyOrder(updated, 'refunded');
    return updated;
  },

  async listByCustomer(customerId: string) {
    return Order.find({ customerId }).sort({ createdAt: -1 }).lean();
  },

  async listByStore(storeId: string) {
    return Order.find({ storeIds: storeId }).sort({ createdAt: -1 }).lean();
  },

  async listAll() {
    return Order.find().sort({ createdAt: -1 }).limit(200).lean();
  },

  async getById(id: string) {
    const order = await Order.findById(id).lean();
    if (!order) throw AppError.notFound('Order not found');
    return order;
  },
};

const STATUS_TITLES: Record<string, string> = {
  pending: 'Order placed 🛍️',
  paid: 'Payment received 💰',
  fulfilled: 'Order fulfilled 📦',
  cancelled: 'Order cancelled',
  refunded: 'Refund processed ↩️',
};

/** Live status push to the customer: socket event (order screen updates instantly) + bell notification. */
function pushOrderStatus(
  order: { _id: unknown; customerId: unknown; status: string; orderNumber: string; amounts?: { grandTotal?: number | null } | null },
  resent = false,
): void {
  const orderId = String(order._id);
  const customerId = String(order.customerId);
  safeEmit(() =>
    emitToUser(customerId, SOCKET_EVENTS.ORDER_STATUS_UPDATED, {
      orderId,
      status: order.status as OrderStatusUpdated['status'],
      at: new Date().toISOString(),
    }),
  );
  const title = STATUS_TITLES[order.status] ?? 'Order update';
  void notify(customerId, {
    type: 'order',
    title: resent ? `${title} (update)` : title,
    body: `${order.orderNumber} · ₹${(order.amounts?.grandTotal ?? 0) / 100}`,
    link: `/order/${orderId}`,
  });
}

/** Notify the customer of an order change: transactional email + in-app (bell) notification. */
async function notifyOrder(order: NotifiableOrder, event: 'placed' | 'paid' | 'refunded' | 'cancelled'): Promise<void> {
  const total = (order.amounts?.grandTotal ?? 0) / 100;
  const titles: Record<string, string> = {
    placed: `Order placed 🛍️`,
    paid: `Payment received 💰`,
    refunded: `Refund processed ↩️`,
    cancelled: `Order cancelled`,
  };
  // In-app notification (persisted + live push to the user's bell).
  void notify(String(order.customerId), {
    type: 'order',
    title: titles[event] ?? 'Order update',
    body: `${order.orderNumber} · ₹${total}`,
    link: order._id ? `/order/${String(order._id)}` : '/account/orders',
  });

  void sendOrderEmail(order, event);
}

/** Return stock to variants (on cancel / refund). */
async function restock(items: { productId: unknown; variantSku?: string | null; qty: number }[]): Promise<void> {
  for (const l of items) {
    await Product.updateOne(
      { _id: l.productId, 'variants.sku': l.variantSku },
      { $inc: { 'variants.$.stock': l.qty } },
    );
  }
}
