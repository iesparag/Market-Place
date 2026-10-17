import { logger } from '../../config/logger.js';
import { Wishlist } from '../../modules/wishlist/wishlist.module.js';
import { Product } from '../../modules/products/product.model.js';
import { notify } from '../../modules/notifications/notifications.module.js';

const SWEEP_INTERVAL_MS = 60 * 60_000; // hourly — price changes aren't time-sensitive like cart abandonment

/**
 * Alerts a customer when a wishlisted product's price drops below what they last saw.
 * `lastSeenPrice` is set when the item is wishlisted (wishlist.module.ts's POST /) and
 * bumped down here after each alert, so a further drop still notifies but the same
 * drop never repeats. Same setInterval-sweep pattern as cart-reminder-sweep.ts.
 */
export async function sweepWishlistPriceDrops(): Promise<number> {
  const watched = await Wishlist.find({ lastSeenPrice: { $exists: true, $ne: null } })
    .select('userId productId lastSeenPrice')
    .limit(2000)
    .lean();
  if (!watched.length) return 0;

  const productIds = [...new Set(watched.map((w) => String(w.productId)))];
  const products = await Product.find({ _id: { $in: productIds }, status: 'active', visibility: 'public' })
    .select('title slug minPrice images')
    .lean();
  const byId = new Map(products.map((p) => [String(p._id), p]));

  let sent = 0;
  for (const w of watched) {
    const product = byId.get(String(w.productId));
    if (!product || product.minPrice == null || w.lastSeenPrice == null) continue;
    if (product.minPrice >= w.lastSeenPrice) continue;

    // Atomic claim on the exact price we're alerting about — if two ticks overlap, or
    // the price moved again between the find and here, only one alert goes out.
    const claimed = await Wishlist.updateOne(
      { _id: w._id, lastSeenPrice: w.lastSeenPrice },
      { $set: { lastSeenPrice: product.minPrice } },
    );
    if (claimed.modifiedCount === 0) continue;

    void notify(String(w.userId), {
      type: 'promo',
      title: '📉 Price drop on your wishlist',
      body: `${product.title} is now cheaper — was ₹${(w.lastSeenPrice / 100).toFixed(0)}, now ₹${(product.minPrice / 100).toFixed(0)}.`,
      link: `/product/${product.slug}`,
      image: product.images?.[0],
      products: [
        {
          id: String(product._id),
          title: product.title,
          slug: product.slug,
          price: product.minPrice,
          originalPrice: w.lastSeenPrice,
          image: product.images?.[0],
        },
      ],
    });
    sent += 1;
  }
  if (sent > 0) logger.info({ sent }, 'wishlist-price-drop-sweep: sent price-drop alerts');
  return sent;
}

let timer: ReturnType<typeof setInterval> | null = null;

export function startWishlistPriceDropSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepWishlistPriceDrops().catch((err) => logger.error({ err }, 'wishlist-price-drop-sweep: sweep failed'));
  }, SWEEP_INTERVAL_MS);
  timer.unref?.();
  logger.info('Wishlist price-drop sweeper started');
}

export function stopWishlistPriceDropSweeper(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
