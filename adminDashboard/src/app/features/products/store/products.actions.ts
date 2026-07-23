import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { ProductRow } from '../services/products.api';

export const ProductsActions = createActionGroup({
  source: 'Products',
  events: {
    Load: emptyProps(),
    'Load Success': props<{ products: ProductRow[] }>(),
    'Load Failure': props<{ error: string }>(),
    // pushed in from a socket event (e.g. inventory change) → same pipeline
    'Inventory Pushed': props<{ productId: string; stock: number }>(),
  },
});
