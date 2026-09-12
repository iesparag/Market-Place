import { User } from '../auth/user.model.js';
import { emailProvider } from '../../providers/email/index.js';

/** The subset of an order shape every lifecycle email needs. */
export interface NotifiableOrder {
  _id?: unknown;
  orderNumber: string;
  customerId: unknown;
  amounts?: { grandTotal?: number | null } | null;
  contact?: { email?: string | null } | null;
}

export type OrderEmailEvent = 'placed' | 'paid' | 'refunded' | 'cancelled' | 'payment_expired';

const EMAIL_COPY: Record<OrderEmailEvent, { subject: string; body: (orderNumber: string, total: number) => string }> = {
  placed: {
    subject: 'Order placed 🛍️',
    body: (n, t) => `<p>Your order <b>${n}</b> has been received.</p><p>Total: ₹${t}</p>`,
  },
  paid: {
    subject: 'Payment received 💰',
    body: (n, t) =>
      `<p>We've received your payment for order <b>${n}</b>.</p><p>Amount paid: ₹${t}</p><p>Your order is confirmed and being prepared.</p>`,
  },
  refunded: {
    subject: 'Refund processed ↩️',
    body: (n, t) => `<p>Your order <b>${n}</b> has been refunded.</p><p>Total: ₹${t}</p>`,
  },
  cancelled: {
    subject: 'Order cancelled',
    body: (n, t) => `<p>Your order <b>${n}</b> has been cancelled.</p><p>Total: ₹${t}</p>`,
  },
  payment_expired: {
    subject: 'Order cancelled — payment not completed',
    body: (n, t) =>
      `<p>Your order <b>${n}</b> was cancelled because payment wasn't completed in time.</p><p>Total: ₹${t}</p><p>Your items are back in stock — feel free to place the order again when you're ready to pay.</p>`,
  },
};

/**
 * Best-effort transactional email for an order lifecycle event.
 * Shared by every place an order changes state (created, paid, cancelled, refunded,
 * auto-expired) so every path sends the same kind of confirmation — never throws,
 * a failed send must not break the order flow.
 */
export async function sendOrderEmail(order: NotifiableOrder, event: OrderEmailEvent): Promise<void> {
  try {
    const user = await User.findById(order.customerId).select('email').lean();
    const to = user?.email ?? order.contact?.email;
    if (!to) return;
    const total = (order.amounts?.grandTotal ?? 0) / 100;
    const copy = EMAIL_COPY[event];
    await emailProvider.send({
      to,
      subject: `${copy.subject} — ${order.orderNumber}`,
      html: copy.body(order.orderNumber, total),
    });
  } catch {
    /* email failure never breaks the order flow */
  }
}
