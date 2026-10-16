import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { permissionGuard } from './core/guards/permission.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth-login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () => import('./layout/shell.component').then((m) => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      // Landing = dashboard, NO permission guard → always renders (no redirect loop).
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'products',
        canMatch: [permissionGuard('product:read')],
        loadChildren: () => import('./features/products/products.routes').then((m) => m.routes),
      },
      {
        path: 'orders',
        canMatch: [permissionGuard('order:read')],
        loadComponent: () => import('./features/orders/orders.page').then((m) => m.OrdersPage),
      },
      {
        path: 'fulfillment',
        canMatch: [permissionGuard('suborder:read')],
        loadComponent: () => import('./features/fulfillment/fulfillment.page').then((m) => m.FulfillmentPage),
      },
      {
        path: 'delivery',
        canMatch: [permissionGuard('rider:read')],
        loadComponent: () => import('./features/delivery/delivery.page').then((m) => m.DeliveryPage),
      },
      {
        path: 'rider-rates',
        canMatch: [permissionGuard('rider:manage')],
        loadComponent: () => import('./features/rider-rates/rider-rates.page').then((m) => m.RiderRatesPage),
      },
      {
        path: 'categories',
        canMatch: [permissionGuard('category:manage')],
        loadComponent: () => import('./features/categories/categories.page').then((m) => m.CategoriesPage),
      },
      {
        path: 'stores',
        canMatch: [permissionGuard('store:read')],
        loadComponent: () => import('./features/stores/stores.page').then((m) => m.StoresPage),
      },
      {
        path: 'vendors/new',
        canMatch: [permissionGuard('store:approve')],
        loadComponent: () => import('./features/stores/vendor-new.page').then((m) => m.VendorNewPage),
      },
      {
        path: 'my-store',
        canMatch: [permissionGuard('store:update')],
        loadComponent: () => import('./features/stores/store-edit.page').then((m) => m.StoreEditPage),
        data: { mine: true },
      },
      {
        path: 'stores/:id',
        canMatch: [permissionGuard('store:read')],
        loadComponent: () => import('./features/stores/store-edit.page').then((m) => m.StoreEditPage),
      },
      {
        path: 'wallet',
        canMatch: [permissionGuard('wallet:read')],
        loadComponent: () => import('./features/finance/finance.page').then((m) => m.FinancePage),
      },
      {
        path: 'payments',
        canMatch: [permissionGuard('payment:read')],
        loadComponent: () => import('./features/payments/payments.page').then((m) => m.PaymentsPage),
      },
      {
        path: 'payouts',
        canMatch: [permissionGuard('payout:read')],
        loadComponent: () => import('./features/finance/finance.page').then((m) => m.FinancePage),
      },
      {
        path: 'users',
        canMatch: [permissionGuard('user:read')],
        loadComponent: () => import('./features/users/users.page').then((m) => m.UsersPage),
      },
      {
        path: 'settings',
        canMatch: [permissionGuard('settings:manage')],
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'appearance',
        canMatch: [permissionGuard('settings:manage')],
        loadComponent: () => import('./features/appearance/appearance.page').then((m) => m.AppearancePage),
      },
      {
        path: 'commissions',
        canMatch: [permissionGuard('commission:manage')],
        loadComponent: () => import('./features/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'coupons',
        canMatch: [permissionGuard('promo:manage')],
        loadComponent: () => import('./features/coupons/coupons.page').then((m) => m.CouponsPage),
      },
      {
        path: 'deals',
        canMatch: [permissionGuard('promo:manage')],
        loadComponent: () => import('./features/deals/deals.page').then((m) => m.DealsPage),
      },
      {
        path: 'home',
        canMatch: [permissionGuard('banner:manage')],
        loadComponent: () => import('./features/home/home.page').then((m) => m.HomeAdminPage),
      },
      {
        path: 'carousel',
        canMatch: [permissionGuard('banner:manage')],
        loadComponent: () => import('./features/carousel/carousel.page').then((m) => m.CarouselPage),
      },
      {
        path: 'festivals',
        canMatch: [permissionGuard('banner:manage')],
        loadComponent: () => import('./features/festivals/festivals.page').then((m) => m.FestivalsPage),
      },
      {
        path: 'announcements',
        canMatch: [permissionGuard('notification:manage')],
        loadComponent: () => import('./features/announcements/announcements.page').then((m) => m.AnnouncementsPage),
      },
      {
        path: 'cart-recovery',
        canMatch: [permissionGuard('notification:manage')],
        loadComponent: () => import('./features/cart-recovery/cart-recovery.page').then((m) => m.CartRecoveryPage),
      },
      {
        path: 'campaigns',
        canMatch: [permissionGuard('notification:manage')],
        loadComponent: () => import('./features/campaigns/campaigns.page').then((m) => m.CampaignsPage),
      },
      {
        path: 'whatsapp-templates',
        canMatch: [permissionGuard('notification:manage')],
        loadComponent: () => import('./features/whatsapp-templates/whatsapp-templates.page').then((m) => m.WhatsAppTemplatesPage),
      },
      {
        path: 'inventory',
        canMatch: [permissionGuard('product:read')],
        loadComponent: () => import('./features/inventory/inventory.page').then((m) => m.InventoryPage),
      },
      {
        path: 'reviews',
        canMatch: [permissionGuard('review:read')],
        loadComponent: () => import('./features/reviews/reviews.page').then((m) => m.ReviewsPage),
      },
      {
        path: 'questions',
        canMatch: [permissionGuard('product:read')],
        loadComponent: () => import('./features/questions/questions.page').then((m) => m.QuestionsPage),
      },
      {
        path: 'roles',
        canMatch: [permissionGuard('role:manage')],
        loadComponent: () => import('./features/roles/roles.page').then((m) => m.RolesPage),
      },
      {
        path: 'audit',
        canMatch: [permissionGuard('audit:read')],
        loadComponent: () => import('./features/audit/audit.page').then((m) => m.AuditPage),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
