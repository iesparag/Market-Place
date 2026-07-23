import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../common/AppError.js';

type Where = 'body' | 'query' | 'params';

/** validate(schema) — Zod-parse a part of the request; replaces it with the parsed value. */
export const validate =
  (schema: ZodTypeAny, where: Where = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[where]);
    if (!result.success) {
      next(
        new AppError(
          'VALIDATION_ERROR',
          422,
          'Validation failed',
          result.error.flatten(),
        ),
      );
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[where] = result.data;
    next();
  };
