import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { ProductsActions } from './products.actions';
import { selectAllProducts, selectProductsLoading } from './products.selectors';

@Injectable({ providedIn: 'root' })
export class ProductsFacade {
  private readonly store = inject(Store);

  readonly products$ = this.store.select(selectAllProducts);
  readonly loading$ = this.store.select(selectProductsLoading);

  load(): void {
    this.store.dispatch(ProductsActions.load());
  }
}
