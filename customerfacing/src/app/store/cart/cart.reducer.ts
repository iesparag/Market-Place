import { createReducer, on } from '@ngrx/store';
import { CartActions } from './cart.actions';
import { initialCartState } from './cart.state';

export const cartReducer = createReducer(
  initialCartState,
  on(CartActions.add, (s, { line }) => {
    const existing = s.lines.find((l) => l.variantSku === line.variantSku);
    return existing
      ? {
          lines: s.lines.map((l) =>
            l.variantSku === line.variantSku ? { ...l, qty: l.qty + line.qty } : l,
          ),
        }
      : { lines: [...s.lines, line] };
  }),
  on(CartActions.remove, (s, { variantSku }) => ({
    lines: s.lines.filter((l) => l.variantSku !== variantSku),
  })),
  on(CartActions.setQty, (s, { variantSku, qty }) => ({
    lines: s.lines.map((l) => (l.variantSku === variantSku ? { ...l, qty } : l)),
  })),
  on(CartActions.clear, () => initialCartState),
);
