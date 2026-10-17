import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../common/AppError.js';
import { fail } from '../common/apiResponse.js';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';
import { captureErrorLog } from '../modules/errorlog/errorlog.module.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    // Only persist real failures (5xx) — 4xx (not found, unauthenticated, validation,
    // forbidden) are expected client/application flow, not bugs to track and fix.
    if (err.status >= 500) {
      logger.error({ err }, 'AppError');
      captureErrorLog(req, { statusCode: err.status, code: err.code, message: err.message, stack: err.stack });
    }
    fail(res, err.code, err.message, err.status, err.details);
    return;
  }
  // Many controllers call `Schema.parse(req.body)` directly (not through the
  // `validate()` middleware), which throws a raw ZodError on bad input. Without this,
  // that falls through to the generic 500 branch below — every validation failure on
  // those routes looked like a server crash instead of a 400, in prod and dev alike.
  if (err instanceof ZodError) {
    fail(res, 'VALIDATION_ERROR', 'Validation failed', 422, err.flatten());
    return;
  }
  logger.error({ err }, 'Unhandled error');
  const message = err instanceof Error ? err.message : String(err);
  const stack = err instanceof Error ? err.stack : undefined;
  captureErrorLog(req, { statusCode: 500, code: 'INTERNAL', message, stack });
  fail(res, 'INTERNAL', isProd ? 'Internal server error' : String(err), 500);
}
