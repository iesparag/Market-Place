import { createReducer, on } from '@ngrx/store';
import { ProductsActions } from './products.actions';
import { productsAdapter, initialProductsState } from './products.state';

export const productsReducer = createReducer(
  initialProductsState,
  on(ProductsActions.load, (s) => ({ ...s, loading: true, error: null })),
  on(ProductsActions.loadSuccess, (s, { products }) =>
    productsAdapter.setAll(products, { ...s, loading: false }),
  ),
  on(ProductsActions.loadFailure, (s, { error }) => ({ ...s, loading: false, error })),
);
