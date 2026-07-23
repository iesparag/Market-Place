import type { Role } from '@app/shared';

/** Attached to req by the auth middleware. */
export interface AuthUser {
  id: string;
  role: Role;
  storeId?: string;
  permissions: string[];
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      storeId?: string;
    }
  }
}

export {};
