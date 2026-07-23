export interface CartLine {
  productId: string;
  variantSku: string;
  title: string;
  slug?: string; // link back to the product page
  image?: string; // first product image (cart thumbnail)
  storeId: string;
  storeName?: string;
  qty: number;
  unitPrice: number; // minor units, incl. modifier deltas
  modifierNames?: string[]; // sent to backend for server-side reprice
}

export interface CartState {
  lines: CartLine[];
}

export const initialCartState: CartState = { lines: [] };
