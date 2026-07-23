import { inject, Injectable } from '@angular/core';
import { Store } from '@ngrx/store';
import { CartActions } from './cart.actions';
import type { CartLine } from './cart.state';
import { selectCartByStore, selectCartCount, selectCartLines, selectCartTotal } from './cart.selectors';

@Injectable({ providedIn: 'root' })
export class CartFacade {
  private readonly store = inject(Store);

  readonly lines$ = this.store.select(selectCartLines);
  readonly byStore$ = this.store.select(selectCartByStore);
  readonly count$ = this.store.select(selectCartCount);
  readonly total$ = this.store.select(selectCartTotal);

  add(line: CartLine): void {
    this.store.dispatch(CartActions.add({ line }));
  }
  remove(variantSku: string): void {
    this.store.dispatch(CartActions.remove({ variantSku }));
  }
  setQty(variantSku: string, qty: number): void {
    if (qty <= 0) this.store.dispatch(CartActions.remove({ variantSku }));
    else this.store.dispatch(CartActions.setQty({ variantSku, qty }));
  }
  clear(): void {
    this.store.dispatch(CartActions.clear());
  }
}
