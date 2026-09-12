# 04 — Roles, Permissions & Dynamic Sidebar

> Who sees what, who can do what, and how the sidebar reflects it. Links: [overview](01-OVERVIEW.md) · [data model](03-DATA-MODEL.md).

## The model: permissions, not screens

We do **not** hard-code "admin sees pages A,B,C". We define granular **permissions**, bundle
them into **roles**, let super_admin grant/revoke, and **generate the UI from the effective
permission set**. This is exactly the requirement: super_admin controls what admin/vendor see.

Three concepts:

1. **Permission** — a `resource:action` string. The atomic unit of access.
2. **Role** — a named bundle of permissions (super_admin, admin, vendor, customer, or custom).
3. **Scope** — `platform` (all stores) vs `store` (only the user's own store).

Effective permissions of a user =
`role.permissions` **+** `user.customPermissions.add` **−** `user.customPermissions.remove`.

## Canonical permission list (`shared/permissions.ts`)

Grouped by module (the group = a sidebar section). This list is the single source of truth,
imported by backend (to enforce) and frontends (to render).

```
Catalog       category:manage  product:read  product:create  product:update  product:delete
Vendors       store:read  store:create  store:update  store:approve  store:suspend  store:delete
Orders        order:read  order:update  order:cancel  order:refund
Fulfillment   suborder:read  suborder:update
Finance       commission:manage  ledger:read  payout:read  payout:release  wallet:read
People        user:read  user:invite  user:update  user:suspend  role:manage
Reviews       review:read  review:moderate
Content       banner:manage  promo:manage
Integrations  integration:manage  integration:sync
Settings      settings:manage  audit:read
Analytics     analytics:read
```

Each permission also carries metadata (module label, icon, route) used to build navigation —
kept in a `PERMISSION_META` map in `shared/`.

## Default roles

| Role | Scope | Gets |
|------|-------|------|
| **super_admin** | platform | **all** permissions (wildcard `*`). Cannot be reduced. |
| **admin** | platform | configurable subset chosen by super_admin. Starter set: `product:read`, `order:read`, `order:refund`, `store:read`, `store:approve`, `store:suspend`, `review:moderate`, `analytics:read`. Notably **not** `store:delete` — hard-deleting a store is super_admin-only by default. |
| **vendor** (store owner) | store | `product:*`, `suborder:read`, `suborder:update`, `order:read`, `wallet:read`, `payout:read`, `review:read`, `store:update` — **all auto-scoped to their store**. |
| **vendor_staff** | store | subset the owner grants (e.g. only `product:*` + `suborder:update`). |
| **customer** | n/a | no dashboard permissions; storefront only. |

super_admin can create **custom roles** (e.g. "Finance admin" = `ledger:read`, `payout:read`,
`payout:release`, `commission:manage`) and toggle any permission per role or per user.

## Enforcement (server-side — the real security)

Middleware chain on protected routes:

```ts
router.post("/products",
  authenticate,                 // verify JWT → req.user
  authorize("product:create"),  // effective-permissions includes it? else 403
  scopeToStore,                 // vendor: force req.storeId = req.user.storeId; super_admin: allow any
  validate(CreateProductSchema),// Zod (from shared/)
  productController.create);
```

- `authorize(perm)` — checks the user's **effective permissions**. `super_admin` (wildcard)
  passes everything.
- `scopeToStore` — for `scope:"store"` users, **injects/overrides `storeId`** so services can
  only read/write that store's rows. Never trust a `storeId` from the request body for these
  users. In every store-scoped query the service adds `{ storeId: req.storeId }`. A vendor
  literally cannot address another vendor's data.
- All list/detail/update/delete services for scoped resources take `storeId` and filter by it.

**Golden rule:** the API is the security boundary. If the UI forgets to hide a button, the API
still says 403. (Rule 5 in CLAUDE.md.)

## Dynamic sidebar / navigation (server-generated)

The frontend must not contain its own copy of "which menu items exist for which role". The
backend computes it:

```
GET /me/navigation   → returns the menu tree filtered to the user's effective permissions
```

```ts
// backend builds this from PERMISSION_META grouped by module
[
  { section: "Catalog", items: [
      { label: "Products",   route: "/products",   perm: "product:read"  },
      { label: "Categories", route: "/categories", perm: "category:manage" } ] },
  { section: "Finance", items: [
      { label: "Payouts",    route: "/payouts",    perm: "payout:read"   } ] },
  ...
].map(drop items whose perm ∉ effectivePermissions)
 .filter(section has ≥1 item)
```

Result:
- A **vendor** sees Catalog (their products), their Orders, their Wallet/Payouts — nothing else.
- A **support admin** sees Orders + Reviews only.
- **super_admin** sees every section.

The admin dashboard renders its sidebar **and guards its routes** from this response plus the
effective-permission list (`GET /me` returns `permissions: string[]`). Frontend route guards
+ conditional buttons use the same permission strings from `shared/`. See
[adminDashboard/PLAN.md](../adminDashboard/PLAN.md).

## Auth mechanics

- **JWT access token** (short-lived, ~15 min) + **refresh token** (httpOnly cookie, rotating).
- Access token payload: `{ sub, role, storeId?, ver }`. `ver` invalidates tokens on
  role/permission change (bump a user token-version to force re-issue).
- Passwords: bcrypt/argon2. Login rate-limited. Password reset + vendor invite via email token.
- Store-scoped users get `storeId` in the token so `scopeToStore` is O(1).

## Vendor onboarding & approval flow

1. Vendor signs up → `store.status = "pending"`, user `role = vendor`.
2. super_admin/admin with `store:approve` reviews → approve/reject.
3. On approve: create **payment connected account** (`payment:manage`), enable product
   creation, send welcome email.
4. Vendor can now create products (scoped to their store) and start selling.

## Suspending vs deleting a store

These are two different permissions on purpose — a support/trust-and-safety role can be
granted `store:suspend` alone, without the power to approve new vendors or delete anything.

- **Suspend** (`store:suspend`, `PATCH /stores/:id/status`) — reversible. A suspended store and
  all its products disappear from the customer storefront everywhere (browse, direct product
  link, store page, related products, AI support search) and can no longer be checked out even
  if items are already sitting in a customer's cart — `orders.service.create` re-checks the
  store's status at order time, not just at browse time. This is the correct action for any
  store that has ever taken an order.
- **Delete** (`store:delete`, `DELETE /stores/:id`, super_admin only by default) — permanent,
  hard delete of the store **and its own products**. It is refused outright if the store has
  any order history (`Order.exists({ storeIds })`), since orders/ledger/payouts reference
  `storeId` and must survive for financial/audit integrity (rule #6). **Categories are never
  touched** — they're a shared platform taxonomy with no `storeId` (see
  [03-DATA-MODEL.md](03-DATA-MODEL.md)), so other vendors' products stay intact.

## Audit

Every sensitive action (`*:approve`, `*:refund`, `payout:release`, `role:manage`,
`settings:manage`, permission changes) writes an `auditLog` entry
`{ actorId, action, targetType, targetId, before, after, at }`. `audit:read` to view.
