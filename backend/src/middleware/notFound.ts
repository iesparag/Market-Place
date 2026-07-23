import type { Request, Response } from 'express';
import { fail } from '../common/apiResponse.js';

export function notFound(req: Request, res: Response): void {
  fail(res, 'NOT_FOUND', `Route not found: ${req.method} ${req.originalUrl}`, 404);
}
