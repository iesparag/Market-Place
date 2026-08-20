import { Role, PERMISSIONS, WILDCARD_PERMISSION, type Permission } from '@app/shared';

/**
 * Default permission bundles per role. super_admin gets the wildcard.
 * (In production these live in the DB and are editable by super_admin — see docs/04-RBAC.md.)
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<string, string[]> = {
  [Role.SUPER_ADMIN]: [WILDCARD_PERMISSION],
  [Role.ADMIN]: [
    'product:read',
    'product:create', // admin can add products on behalf of any vendor
    'product:update',
    'category:manage',
    'order:read',
    'order:refund',
    'payment:read',
    'payment:refund',
    'ledger:read',
    'store:read',
    'store:approve',
    'review:read',
    'review:moderate',
    'analytics:read',
    'notification:manage', // send push / announcements
    'banner:manage', // manage carousel + landing-page sections
    'promo:manage', // coupons
    'support:read', // AI support inbox
    'support:reply',
    'support:assign',
    'support:config', // owns every support feature toggle
    'kb:manage',
  ],
  [Role.VENDOR]: [
    'product:read',
    'product:create',
    'product:update',
    'product:delete',
    'suborder:read',
    'suborder:update',
    'order:read',
    'payment:read',
    'wallet:read',
    'payout:read',
    'review:read',
    'store:update',
    'support:read', // sees only their store's tickets (store-scoped)
    'support:reply',
    'kb:manage', // their store's KB docs
  ],
  [Role.VENDOR_STAFF]: [
    'product:read',
    'product:update',
    'suborder:read',
    'suborder:update',
    'support:read',
    'support:reply',
  ],
  [Role.CUSTOMER]: [],
};

/** Effective permissions = role bundle + custom.add − custom.remove. */
export function effectivePermissions(
  role: string,
  custom?: { add?: string[]; remove?: string[] },
): string[] {
  const base = DEFAULT_ROLE_PERMISSIONS[role] ?? [];
  if (base.includes(WILDCARD_PERMISSION)) return [WILDCARD_PERMISSION];
  const set = new Set<string>(base);
  for (const p of custom?.add ?? []) set.add(p);
  for (const p of custom?.remove ?? []) set.delete(p);
  return [...set];
}

export const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;
