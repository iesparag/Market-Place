import { Router } from 'express';
import { healthRoutes } from '../modules/health/health.routes.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { usersRoutes } from '../modules/users/users.routes.js';
import { categoriesRoutes } from '../modules/categories/categories.routes.js';
import { productsRoutes } from '../modules/products/products.routes.js';
import { storesRoutes } from '../modules/stores/stores.routes.js';
import { catalogRoutes } from '../modules/catalog/catalog.routes.js';
import { ordersRoutes } from '../modules/orders/orders.routes.js';
import { payoutsRoutes } from '../modules/payouts/payouts.routes.js';
import { settingsRoutes } from '../modules/settings/settings.routes.js';
import { analyticsRoutes } from '../modules/analytics/analytics.module.js';
import { reviewsRoutes } from '../modules/reviews/reviews.module.js';
import { addressesRoutes } from '../modules/addresses/addresses.module.js';
import { wishlistRoutes } from '../modules/wishlist/wishlist.module.js';
import { mediaRoutes } from '../modules/media/media.module.js';
import { couponsRoutes } from '../modules/coupons/coupons.module.js';
import { auditRoutes } from '../modules/audit/audit.module.js';
import { bannersRoutes } from '../modules/banners/banners.module.js';
import { notificationsRoutes } from '../modules/notifications/notifications.module.js';
import { faqRoutes } from '../modules/faq/faq.module.js';

/**
 * Mount every module router. As modules are built, register them here.
 * (Stubbed modules live under src/modules/<name>/ ready to be filled — see STRUCTURE.md.)
 */
export function buildApiRouter(): Router {
  const api = Router();

  api.use('/', usersRoutes); // /me, /me/navigation
  api.use('/auth', authRoutes);
  api.use('/stores', storesRoutes);
  api.use('/categories', categoriesRoutes);
  api.use('/products', productsRoutes);
  api.use('/catalog', catalogRoutes); // public storefront reads
  api.use('/orders', ordersRoutes);
  api.use('/payouts', payoutsRoutes);
  api.use('/settings', settingsRoutes);
  api.use('/analytics', analyticsRoutes);
  api.use('/reviews', reviewsRoutes);
  api.use('/addresses', addressesRoutes);
  api.use('/wishlist', wishlistRoutes);
  api.use('/media', mediaRoutes);
  api.use('/coupons', couponsRoutes);
  api.use('/audit', auditRoutes);
  api.use('/banners', bannersRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/faq', faqRoutes);

  return api;
}

export { healthRoutes };
