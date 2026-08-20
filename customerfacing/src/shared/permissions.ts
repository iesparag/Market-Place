/**
 * Canonical permission list (single source of truth).
 * Imported by backend (to enforce) and frontends (to render nav + guards).
 * See docs/04-RBAC.md.
 */
export const PERMISSIONS = [
  // Catalog
  'category:manage',
  'product:read',
  'product:create',
  'product:update',
  'product:delete',
  // Vendors
  'store:read',
  'store:create',
  'store:update',
  'store:approve',
  'store:suspend',
  // Orders
  'order:read',
  'order:update',
  'order:cancel',
  'order:refund',
  // Fulfillment
  'suborder:read',
  'suborder:update',
  // Finance
  'commission:manage',
  'ledger:read',
  'payment:read',
  'payment:refund',
  'payout:read',
  'payout:release',
  'wallet:read',
  // People
  'user:read',
  'user:invite',
  'user:update',
  'user:suspend',
  'role:manage',
  // Reviews
  'review:read',
  'review:moderate',
  // Content
  'banner:manage',
  'promo:manage',
  // Integrations
  'integration:manage',
  'integration:sync',
  // Settings
  'settings:manage',
  'audit:read',
  // Analytics
  'analytics:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Wildcard granted to super_admin. */
export const WILDCARD_PERMISSION = '*' as const;

export interface NavItemMeta {
  perm: Permission;
  label: string;
  route: string;
}
export interface NavSectionMeta {
  section: string;
  items: NavItemMeta[];
}

/**
 * Nav metadata used to build the dynamic sidebar (GET /me/navigation).
 * The backend filters this by the user's effective permissions.
 */
export const NAV_META: NavSectionMeta[] = [
  {
    section: 'Catalog',
    items: [
      { perm: 'product:read', label: 'Products', route: '/products' },
      { perm: 'category:manage', label: 'Categories', route: '/categories' },
    ],
  },
  {
    section: 'Vendors',
    items: [{ perm: 'store:read', label: 'Stores', route: '/stores' }],
  },
  {
    section: 'Orders',
    items: [
      { perm: 'order:read', label: 'Orders', route: '/orders' },
      { perm: 'suborder:read', label: 'Fulfillment', route: '/fulfillment' },
    ],
  },
  {
    section: 'Finance',
    items: [
      { perm: 'wallet:read', label: 'Wallet', route: '/wallet' },
      { perm: 'payment:read', label: 'Payments', route: '/payments' },
      { perm: 'payout:read', label: 'Payouts', route: '/payouts' },
      { perm: 'commission:manage', label: 'Commissions', route: '/commissions' },
    ],
  },
  {
    section: 'People',
    items: [
      { perm: 'user:read', label: 'Users', route: '/users' },
      { perm: 'role:manage', label: 'Roles', route: '/roles' },
    ],
  },
  {
    section: 'Reviews',
    items: [{ perm: 'review:read', label: 'Reviews', route: '/reviews' }],
  },
  {
    section: 'Integrations',
    items: [{ perm: 'integration:manage', label: 'Integrations', route: '/integrations' }],
  },
  {
    section: 'Settings',
    items: [
      { perm: 'settings:manage', label: 'Settings', route: '/settings' },
      { perm: 'audit:read', label: 'Audit Log', route: '/audit' },
    ],
  },
  {
    section: 'Analytics',
    items: [{ perm: 'analytics:read', label: 'Analytics', route: '/analytics' }],
  },
];
