import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

/**
 * Render mode per route is configured via the SSR build (prerender for catalog/product,
 * server for search, client for cart/checkout/account). See customerfacing/PLAN.md.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./features/home.component').then((m) => m.HomeComponent),
  },
  {
    path: 'catalog',
    loadComponent: () =>
      import('./features/catalog/catalog-list.component').then((m) => m.CatalogListComponent),
  },
  {
    path: 'p/:slug',
    loadComponent: () =>
      import('./features/product/pages/product-detail.page').then((m) => m.ProductDetailPage),
  },
  {
    path: 'stores',
    loadComponent: () => import('./features/store/stores-list.component').then((m) => m.StoresListComponent),
  },
  {
    path: 'store/:slug',
    loadComponent: () => import('./features/store/store.page').then((m) => m.StorePage),
  },
  {
    path: 'cart',
    loadComponent: () => import('./features/cart.component').then((m) => m.CartComponent),
  },
  {
    path: 'checkout',
    canActivate: [authGuard],
    loadComponent: () => import('./features/checkout/checkout.component').then((m) => m.CheckoutComponent),
  },
  {
    path: 'login',
    loadComponent: () => import('./features/account/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'register',
    loadComponent: () => import('./features/account/register.component').then((m) => m.RegisterComponent),
  },
  {
    path: 'become-vendor',
    loadComponent: () => import('./features/account/become-vendor.component').then((m) => m.BecomeVendorComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/account/forgot-password.component').then((m) => m.ForgotPasswordComponent),
  },
  {
    path: 'account',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/account.component').then((m) => m.AccountComponent),
  },
  {
    path: 'account/orders',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/orders.component').then((m) => m.OrdersComponent),
  },
  {
    path: 'account/wishlist',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/wishlist.component').then((m) => m.WishlistComponent),
  },
  {
    path: 'account/addresses',
    canActivate: [authGuard],
    loadComponent: () => import('./features/account/addresses.component').then((m) => m.AddressesComponent),
  },
  {
    path: 'order/:id',
    loadComponent: () =>
      import('./features/account/order-confirmation.component').then((m) => m.OrderConfirmationComponent),
  },
  { path: '**', redirectTo: '' },
];
