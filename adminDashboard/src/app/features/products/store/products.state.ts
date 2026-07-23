import { createEntityAdapter, type EntityState } from '@ngrx/entity';
import type { ProductRow } from '../services/products.api';

export const productsAdapter = createEntityAdapter<ProductRow>({
  selectId: (p) => p._id,
});

export interface ProductsState extends EntityState<ProductRow> {
  loading: boolean;
  error: string | null;
}

export const initialProductsState: ProductsState = productsAdapter.getInitialState({
  loading: false,
  error: null,
});
