import { Routes } from '@angular/router';
import { provideState } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { productsReducer } from './store/products.reducer';
import { ProductsEffects } from './store/products.effects';

/** Feature routes register their NgRx state LAZILY — loaded only when this feature loads. */
export const routes: Routes = [
  {
    path: '',
    providers: [provideState('products', productsReducer), provideEffects(ProductsEffects)],
    loadComponent: () => import('./pages/products-list.page').then((m) => m.ProductsListPage),
  },
  {
    path: 'new',
    loadComponent: () => import('./pages/product-edit.page').then((m) => m.ProductEditPage),
  },
  {
    path: ':id/edit',
    loadComponent: () => import('./pages/product-edit.page').then((m) => m.ProductEditPage),
  },
];
