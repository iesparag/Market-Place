import { INIT, type ActionReducer } from '@ngrx/store';

const KEY = 'mkt_cart';
const canUseStorage = (): boolean => typeof localStorage !== 'undefined';

/**
 * Meta-reducer: hydrate the cart from localStorage on boot and save on every change.
 * SSR-safe (no localStorage on the server) so the cart survives refresh/navigation.
 * Generic over the root state so it plugs into provideStore without a type clash.
 */
export function cartPersistence<S>(reducer: ActionReducer<S>): ActionReducer<S> {
  return (state, action) => {
    let seed = state;
    if (action.type === INIT && seed === undefined && canUseStorage()) {
      try {
        const raw = localStorage.getItem(KEY);
        if (raw) seed = { cart: JSON.parse(raw) } as S;
      } catch { /* corrupt storage — ignore */ }
    }
    const next = reducer(seed, action);
    if (canUseStorage()) {
      const cart = (next as Record<string, unknown> | undefined)?.['cart'];
      if (cart) {
        try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* quota — ignore */ }
      }
    }
    return next;
  };
}
