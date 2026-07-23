import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/product-detail.page').then((m) => m.ProductDetailPage),
  },
];
