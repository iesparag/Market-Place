import type { NextFunction, Request, Response } from 'express';
import { Role } from '@app/shared';

/**
 * Store-scoped users (vendor, vendor_staff) may only act on their own store.
 * We force req.storeId from the token — never trust a storeId in the body.
 * Platform users (super_admin, admin) may target any store via query/body.
 */
export function scopeToStore(req: Request, _res: Response, next: NextFunction): void {
  const user = req.user;
  if (!user) {
    next();
    return;
  }
  const isStoreScoped = user.role === Role.VENDOR || user.role === Role.VENDOR_STAFF;
  if (isStoreScoped) {
    req.storeId = user.storeId;
  } else {
    req.storeId = (req.query.storeId as string) ?? (req.body?.storeId as string) ?? undefined;
  }
  next();
}
