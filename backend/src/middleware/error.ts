import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../common/AppError.js';
import { fail } from '../common/apiResponse.js';
import { logger } from '../config/logger.js';
import { isProd } from '../config/env.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.status >= 500) logger.error({ err }, 'AppError');
    fail(res, err.code, err.message, err.status, err.details);
    return;
  }
  logger.error({ err }, 'Unhandled error');
  fail(res, 'INTERNAL', isProd ? 'Internal server error' : String(err), 500);
}
