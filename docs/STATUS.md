# STATUS — what's done vs missing (living doc)

Legend: ✅ done · 🟡 partial · ⬜ missing (stub folder exists) · 🔴 not started

## Backend (Node/Express/Mongo/TS)

| Area | State | Notes |
|------|-------|-------|
| Config/middleware/common | ✅ | env, auth, authorize, scopeToStore, validate, error, money |
| Auth | ✅ | login, register (customer), register-vendor (creates store) |
| Users / me / navigation | ✅ | dynamic sidebar from permissions |
| Roles / permissions | 🟡 | permission map + effective perms; no DB-editable roles UI |
| Stores (vendors) | ✅ | create, list, approve, my-store |
| Categories (+ attribute schema) | ✅ | CRUD |
| Products (dynamic attrs + variants + modifiers) | 🟡 | create/update/list; **no delete, no stock adjust endpoint** |
| Catalog (public) | ✅ | products, product/:slug, categories, stores/:slug |
| Orders | 🟡 | create (server reprice) + list; **no status update, no sub-orders, no stock decrement** |
| Realtime (sockets) | 🟡 | server + rooms + emitters exist but **not emitted anywhere** |
| Inventory / stock | 🔴 | no decrement on order, no adjust API |
| Payments / wallet / ledger / payouts | ⬜ | provider stub only |
| Reviews · wishlist · coupons · addresses | ⬜ | stub folders |
| Notifications (email/SMS/push/in-app) | ⬜ | console email provider only, not wired |
| Media upload · search engine · analytics | ⬜ | — |
| Jobs (BullMQ) · audit · settings | ⬜ | queue stub |

## Admin dashboard (Angular + NgRx)

| Area | State | Notes |
|------|-------|-------|
| Auth + permission-driven shell/sidebar/guards | ✅ | |
| Dashboard landing (tiles) | ✅ | |
| Products **list** | ✅ | |
| Products **create/edit** (dynamic form) | 🔴 | **CRITICAL — vendor can't add products/stock yet** |
| Categories management | 🔴 | needed to define product schemas |
| Stores / vendor approval | 🔴 | |
| Orders list | 🟡 | list only; **no status actions, no detail** |
| Realtime new-order notification | 🔴 | socket service is a stub |
| Store profile (vendor edits own) | 🔴 | |
| Users / roles mgmt | 🔴 | |
| Wallet / payouts / finance | 🔴 | |
| Reviews · coupons · analytics · settings · audit | 🔴 | |

## Customer storefront (Angular SSR)

| Area | State | Notes |
|------|-------|-------|
| Auth (login/register) | ✅ | |
| Catalog list + search | ✅ | |
| Product detail (variants/modifiers/live price) | ✅ | |
| Cart + checkout → order + confirmation + my-orders | ✅ | |
| Category/vendor browse pages | 🔴 | |
| Order tracking (live status) | 🔴 | shows status, not realtime |
| Reviews · wishlist · addresses · profile | 🔴 | |
| Payments at checkout | 🔴 | order created as `pending`, no pay |

---

## Phased plan to production-grade

**Phase A — Catalog control + Order lifecycle + Realtime (✅ DONE 2026-07-12)**
Vendor manages products & stock; orders flow to vendor + admin live. Verified end-to-end
(vendor product create, invalid-attr reject, catalog, order reprice, stock decrement, status update, store-scoped list).
- Backend ✅: order status update (`PATCH /orders/:id/status`, store-scoped), stock decrement on order,
  socket emit new-order→store & admin + status→customer, product get-one/delete.
- Admin ✅: Categories mgmt (attribute-schema editor), **Product create/edit (dynamic form)**,
  Stores/approval, Order status actions, realtime new-order toast (socket + NotificationService).
- Customer ⬜ (next): live order status on tracking page.

**Phase B — reviews, wishlist, addresses, order tracking (🟡 mostly done 2026-07-12)**
✅ product reviews (write/read, rating aggregate), ✅ wishlist (heart on product + page),
✅ address book, ✅ customer live order tracking (socket status + progress steps).
⬜ still: stock adjust API + low-stock alerts, vendor storefront pages, review moderation.

**Phase C — Payments & finance (✅ core done 2026-07-12, mock provider)**
✅ commission engine (per-store, snapshot on pay), ✅ double-entry ledger, ✅ vendor wallet
(derived), ✅ payout release (admin) + history, ✅ customer "Pay" (mock → paid + ledger, idempotent),
✅ admin finance page + platform-commission analytics. Verified: pay ₹539 → 15% commission ₹80.85
→ wallet ₹458.15 → payout → 0. ⬜ still: real Stripe Connect adapter, refunds, payout hold window.

**Phase D — People & ops (🟡 core done 2026-07-12)**
✅ users mgmt (list + change role), ✅ analytics dashboard (KPIs: orders/revenue/commission/wallet),
✅ platform settings (commission %). ⬜ still: role/permission editor UI, coupons/promotions,
email notifications, audit log.

**Customer profile + Amazon-like storefront (✅ done 2026-07-12)**
✅ **Profile**: PATCH /me (name/phone), change-password, **email OTP verify** (send/verify, 6-digit,
console email in dev); `/me` returns phone+emailVerified. ✅ **Account dashboard** (/account: profile
edit, verify email, password change, quick links to orders/addresses/wishlist). ✅ **Amazon-like
product page**: multi-image **gallery** (main + thumbs), rating stars summary, breadcrumb, **quantity**
selector, **Buy now** + Add to cart, stock status, delivery info, **related products** row, wishlist.
✅ **Rich home**: category tiles + New arrivals + Top rated rows. ✅ **Header**: prominent **search bar**
(→ /catalog?q=) + **account dropdown**; catalog reads ?q & ?category. Verified e2e 4/4 (profile, OTP,
password, related).

**Admin ops: Roles editor + Audit + CSV (✅ done 2026-07-12)**
✅ **Role/permission editor** (admin picks user → toggle permissions grouped by module → saved as
customPermissions add/remove diff vs role; applies on next login — verified: granting product:read+
order:read makes nav show Catalog+Orders). ✅ **Audit log** (writeAudit on store approve/status,
order refund, payout release, role change, permission change; admin page + GET /audit). ✅ **CSV export**
(orders, users, audit — client-side download helper). Verified e2e 4/4.

**Inventory + Discovery + Reviews + Email (✅ done 2026-07-12)**
✅ **Inventory**: stock adjust (admin page), out-of-stock check on order (INSUFFICIENT_STOCK),
low-stock report + realtime alert to vendor. ✅ **Search/filters**: category chips + sort (newest/
rating) + price range; **vendor storefront** page (/store/:slug); **out-of-stock** UI on product.
✅ **Reviews**: verified-purchase badge (checks paid order), moderation (admin hide/show; hidden
excluded from public + rating). ✅ **Email notifications**: order placed/paid/refunded/cancelled via
email provider (console in dev). Verified e2e: 7/7 (stock, out-of-stock, low-stock, filters, store,
verified review, moderation) + emails firing.

**Checkout & order completeness (✅ done 2026-07-12)**
✅ **Coupons** (percent/flat, min/max, usage limit; admin CRUD + customer apply at checkout),
✅ **Tax (GST%)** + **delivery fee** (free above threshold) in order amounts + settings,
✅ **Order cancel** (customer, pending → restock), ✅ **Refund** (admin/vendor: paid → reverse
ledger + commission clawback + restock). Verified e2e: coupon ₹53.90 off, tax ₹24.26, refund
restores wallet, cancel restocks, invalid coupon rejected.

**Phase E — Hardening (🟡 started 2026-07-12)**
✅ image upload (multer → /uploads static, admin product editor + customer image display),
✅ catalog pagination (page/limit + customer "Load more"), ✅ backend vitest tests (money/reprice),
✅ rate limits (apiLimiter/authLimiter) + helmet, ✅ logo→home.
⬜ still: sub-orders split, pagination on ALL lists, S3/Cloudinary storage, search engine (Meili),
CI/CD, Docker deploy, e2e (Playwright), observability (Sentry), caching.

Update this file as items land.
