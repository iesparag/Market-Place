import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '@app/shared';
import { WILDCARD_PERMISSION } from '@app/shared';
import { AppError } from '../common/AppError.js';

/** authorize(permission) — checks the user's effective permissions. super_admin (wildcard) passes all. */
export const authorize =
  (permission: Permission) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const perms = req.user?.permissions ?? [];
    if (perms.includes(WILDCARD_PERMISSION) || perms.includes(permission)) {
      next();
      return;
    }
    next(AppError.forbidden(`Missing permission: ${permission}`));
  };
