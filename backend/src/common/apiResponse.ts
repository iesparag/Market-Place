import type { Response } from 'express';
import type { ApiResponse, PaginationMeta } from '@app/shared';

export function ok<T>(res: Response, data: T, meta?: PaginationMeta, status = 200): Response {
  const body: ApiResponse<T> = meta ? { ok: true, data, meta } : { ok: true, data };
  return res.status(status).json(body);
}

export function created<T>(res: Response, data: T): Response {
  return ok(res, data, undefined, 201);
}

export function fail(
  res: Response,
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): Response {
  const body: ApiResponse<never> = { ok: false, error: { code, message, details } };
  return res.status(status).json(body);
}
