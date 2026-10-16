import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { Cart } from '../../modules/cart/cart.module.js';
import { notify } from '../../modules/notifications/notifications.module.js';
import { User } from '../../modules/auth/user.model.js';
import { WhatsAppTemplate } from '../../modules/whatsapp/whatsapp.module.js';
import { whatsappProvider } from '../../providers/whatsapp/index.js';

const SWEEP_INTERVAL_MS = 15 * 60_000; // every 15 minutes — fine-grained enough to not miss the window
const EVENING_START_HOUR_IST = 18; // 6 PM
const EVENING_END_HOUR_IST = 20; // 8 PM — a 2-hour window so a 15-min sweep can't skip it
const MAX_REMINDERS = 5; // "next 5 days" — one reminder per day, then stop

/**
 * Nudge customers who left items sitting in their cart — one notification per day, in
 * the evening, for the 5 days following abandonment. Stops as soon as the cart empties
 * (checkout or manual clear — see Cart.sync in cart.module.ts) or 5 reminders have gone out.
 *
 * No real cron lib in this codebase (see payment-expiry.ts / auto-assign-sweep.ts) — same
 * setInterval-sweep pattern, just gated to only act inside the evening window.
 */
export async function sweepAbandonedCarts(now = new Date()): Promise<number> {
  const ist = new Date(now.getTime() + 5.5 * 60 * 60_000); // IST = UTC+5:30, no DST
  if (ist.getUTCHours() < EVENING_START_HOUR_IST || ist.getUTCHours() >= EVENING_END_HOUR_IST) return 0;
  const today = ist.toISOString().slice(0, 10);

  const carts = await Cart.find({
    'items.0': { $exists: true },
    remindersSent: { $lt: MAX_REMINDERS },
    lastReminderDate: { $ne: today },
  })
    .limit(500)
    .lean();

  // Resolved once per sweep tick, not per cart — looking it up 500 times for a feature
  // that's off by default (no WHATSAPP_CART_REMINDER_TEMPLATE set) would be pure waste.
  const template = env.WHATSAPP_CART_REMINDER_TEMPLATE
    ? await WhatsAppTemplate.findOne({ name: env.WHATSAPP_CART_REMINDER_TEMPLATE, status: 'approved' }).lean()
    : null;

  let sent = 0;
  let whatsappSent = 0;
  for (const cart of carts) {
    // Atomic claim — if two ticks overlap (sweep took > interval), only one sends.
    const claimed = await Cart.updateOne(
      { _id: cart._id, lastReminderDate: { $ne: today } },
      { $set: { lastReminderDate: today }, $inc: { remindersSent: 1 } },
    );
    if (claimed.modifiedCount === 0) continue;

    const count = cart.items.reduce((n, i) => n + i.qty, 0);
    // First item's image, not a generic banner — a push with an actual product photo
    // reads as "your Margherita pizza is waiting," not just another promo blast.
    const firstItem = cart.items.find((i) => i.image);
    const itemLabel = cart.items[0]?.title;
    void notify(String(cart.userId), {
      type: 'promo',
      title: '🛒 Still want it?',
      body: itemLabel
        ? `${itemLabel}${count > 1 ? ` + ${count - 1} more` : ''} is waiting in your cart — grab it before it's gone!`
        : `${count} item${count === 1 ? '' : 's'} waiting for you — complete your order before it's gone.`,
      link: '/cart',
      image: firstItem?.image ?? undefined,
    });
    sent += 1;

    // WhatsApp is opt-in only (Meta policy — see User.whatsappOptIn) and additive to the
    // push above, never a replacement: push always fires, WhatsApp only when the customer
    // has actually consented AND an approved template is configured.
    if (template) {
      const user = await User.findById(cart.userId).select('name phone whatsappOptIn').lean();
      if (user?.whatsappOptIn && user.phone) {
        const result = await whatsappProvider.sendTemplate({
          to: user.phone,
          templateName: template.name,
          languageCode: template.language,
          bodyParams: Array.from({ length: template.variableCount }, (_, i) =>
            i === 0 ? (user.name || 'there') : i === 1 ? String(count) : '',
          ),
        });
        if (result.sent) whatsappSent += 1;
      }
    }
  }
  if (sent > 0) logger.info({ sent, whatsappSent }, 'cart-reminder-sweep: sent abandoned-cart reminders');
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

/** Start the sweeper. Safe to call once at boot; a second call is a no-op. */
export function startCartReminderSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepAbandonedCarts().catch((err) => logger.error({ err }, 'cart-reminder-sweep: sweep failed'));
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  logger.info('Cart reminder sweeper started');
}

export function stopCartReminderSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
