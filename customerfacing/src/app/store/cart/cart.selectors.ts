import { createFeatureSelector, createSelector } from '@ngrx/store';
import type { CartState } from './cart.state';

export const selectCart = createFeatureSelector<CartState>('cart');
export const selectCartLines = createSelector(selectCart, (s) => s.lines);
export const selectCartCount = createSelector(selectCartLines, (lines) =>
  lines.reduce((n, l) => n + l.qty, 0),
);
export const selectCartTotal = createSelector(selectCartLines, (lines) =>
  lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0),
);
/** Marketplace: group cart by store (mirrors sub-orders). */
export const selectCartByStore = createSelector(selectCartLines, (lines) => {
  const map = new Map<string, typeof lines>();
  for (const l of lines) map.set(l.storeId, [...(map.get(l.storeId) ?? []), l]);
  return [...map.entries()].map(([storeId, storeLines]) => ({ storeId, lines: storeLines }));
});
