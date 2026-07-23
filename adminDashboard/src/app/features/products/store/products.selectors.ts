import { createFeatureSelector, createSelector } from '@ngrx/store';
import { productsAdapter, type ProductsState } from './products.state';

export const selectProductsState = createFeatureSelector<ProductsState>('products');
const { selectAll } = productsAdapter.getSelectors();

export const selectAllProducts = createSelector(selectProductsState, selectAll);
export const selectProductsLoading = createSelector(selectProductsState, (s) => s.loading);
