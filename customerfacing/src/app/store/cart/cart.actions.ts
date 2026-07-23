import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { CartLine } from './cart.state';

export const CartActions = createActionGroup({
  source: 'Cart',
  events: {
    Add: props<{ line: CartLine }>(),
    'Remove': props<{ variantSku: string }>(),
    'Set Qty': props<{ variantSku: string; qty: number }>(),
    Clear: emptyProps(),
  },
});
