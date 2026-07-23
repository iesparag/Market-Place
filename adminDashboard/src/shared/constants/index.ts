export const LIMITS = {
  MAX_CART_ITEMS: 100,
  MAX_PAGE_SIZE: 100,
  MAX_UPLOAD_MB: 10,
} as const;

export const DEFAULTS = {
  CURRENCY: 'INR',
  COMMISSION_PERCENT: 15, // platform default; overridable per category/store
  PAYOUT_HOLD_DAYS: 2,
} as const;
