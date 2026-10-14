import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { BEARER_PREFIX } from '../config/constants.js';
import { AppError } from '../common/AppError.js';
import type { RiderAuthPayload } from '../modules/riders/rider.types.js';

/** Verify a rider access token and attach req.rider. Separate scope from `authenticate` on purpose. */
export function authenticateRider(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    next(AppError.unauthenticated());
    return;
  }
  try {
    const token = header.slice(BEARER_PREFIX.length);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as RiderAuthPayload;
    if (payload.type !== 'rider') {
      next(AppError.unauthenticated());
      return;
    }
    req.rider = payload;
    next();
  } catch {
    next(AppError.unauthenticated('Invalid or expired token'));
  }
}
