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
import { paymentsRoutes } from '../modules/payments/payments.routes.js';
import { settingsRoutes } from '../modules/settings/settings.routes.js';
import { analyticsRoutes } from '../modules/analytics/analytics.module.js';
import { reviewsRoutes } from '../modules/reviews/reviews.module.js';
import { addressesRoutes } from '../modules/addresses/addresses.module.js';
import { geocodingRoutes } from '../modules/geocoding/geocoding.routes.js';
import { placesRoutes } from '../modules/places/places.routes.js';
import { routingRoutes } from '../modules/routing/routing.routes.js';
import { deliveryTasksRoutes } from '../modules/delivery/delivery-tasks.routes.js';
import { ridersRoutes } from '../modules/riders/riders.routes.js';
import { riderPayoutRatesRoutes } from '../modules/riders/rider-payout-rate.model.js';
import { festivalsRoutes } from '../modules/festivals/festivals.module.js';
import { cartRoutes } from '../modules/cart/cart.module.js';
import { campaignsRoutes } from '../modules/campaigns/campaigns.module.js';
import { whatsappRoutes } from '../modules/whatsapp/whatsapp.module.js';
import { wishlistRoutes, storeFavouritesRoutes } from '../modules/wishlist/wishlist.module.js';
import { mediaRoutes } from '../modules/media/media.module.js';
import { couponsRoutes } from '../modules/coupons/coupons.module.js';
import { promotionsRoutes } from '../modules/promotions/promotions.module.js';
import { auditRoutes } from '../modules/audit/audit.module.js';
import { bannersRoutes } from '../modules/banners/banners.module.js';
import { notificationsRoutes } from '../modules/notifications/notifications.module.js';
import { faqRoutes } from '../modules/faq/faq.module.js';
import { homeRoutes } from '../modules/home/home.module.js';
import { searchRoutes } from '../modules/search/search.module.js';
import { appConfigRoutes } from '../modules/appconfig/appconfig.module.js';
import { supportRoutes } from '../modules/support/support.routes.js';
import { errorLogRoutes } from '../modules/errorlog/errorlog.module.js';
import { loyaltyRoutes } from '../modules/loyalty/loyalty.module.js';
import { referralRoutes } from '../modules/referral/referral.module.js';
import { recentlyViewedRoutes } from '../modules/recentlyviewed/recently-viewed.module.js';
import { integrationsRoutes } from '../modules/integrations/integrations.module.js';

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
  api.use('/payments', paymentsRoutes);
  api.use('/payouts', payoutsRoutes);
  api.use('/settings', settingsRoutes);
  api.use('/analytics', analyticsRoutes);
  api.use('/reviews', reviewsRoutes);
  api.use('/addresses', addressesRoutes);
  api.use('/geocode', geocodingRoutes);
  api.use('/places', placesRoutes);
  api.use('/routing', routingRoutes);
  api.use('/delivery', deliveryTasksRoutes);
  api.use('/riders', ridersRoutes);
  api.use('/rider-payout-rates', riderPayoutRatesRoutes);
  api.use('/festivals', festivalsRoutes);
  api.use('/cart', cartRoutes);
  api.use('/campaigns', campaignsRoutes);
  api.use('/whatsapp', whatsappRoutes);
  api.use('/wishlist', wishlistRoutes);
  api.use('/favourite-stores', storeFavouritesRoutes);
  api.use('/media', mediaRoutes);
  api.use('/coupons', couponsRoutes);
  api.use('/promotions', promotionsRoutes);
  api.use('/audit', auditRoutes);
  api.use('/banners', bannersRoutes);
  api.use('/notifications', notificationsRoutes);
  api.use('/faq', faqRoutes);
  api.use('/home-sections', homeRoutes);
  api.use('/search', searchRoutes);
  api.use('/app', appConfigRoutes);
  api.use('/support', supportRoutes);
  api.use('/errors', errorLogRoutes);
  api.use('/loyalty', loyaltyRoutes);
  api.use('/referral', referralRoutes);
  api.use('/recently-viewed', recentlyViewedRoutes);
  api.use('/integrations', integrationsRoutes);

  return api;
}

export { healthRoutes };
