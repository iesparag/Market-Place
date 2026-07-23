import { z } from 'zod';

/** Standard success/error envelope used by every endpoint. */
export type ApiSuccess<T> = {
  ok: true;
  data: T;
  meta?: PaginationMeta;
};
export type ApiError = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiError;

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
}

/** Query params for list endpoints. */
export const PaginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** Stable, machine-readable error codes. */
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PRODUCT_ATTR_INVALID: 'PRODUCT_ATTR_INVALID',
  INSUFFICIENT_STOCK: 'INSUFFICIENT_STOCK',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INTERNAL: 'INTERNAL',
} as const;
export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
