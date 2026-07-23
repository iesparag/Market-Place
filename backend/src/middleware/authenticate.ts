import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { BEARER_PREFIX } from '../config/constants.js';
import { AppError } from '../common/AppError.js';
import type { AuthUser } from '../common/types.js';

/** Verify the access token and attach req.user. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith(BEARER_PREFIX)) {
    next(AppError.unauthenticated());
    return;
  }
  try {
    const token = header.slice(BEARER_PREFIX.length);
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    next(AppError.unauthenticated('Invalid or expired token'));
  }
}
