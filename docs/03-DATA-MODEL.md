# 03 — Data Model ★

> The most important doc. How **one product model serves every vendor type** while staying
> type-safe. Links: [overview](01-OVERVIEW.md) · [architecture](02-ARCHITECTURE.md) · [payments](05-PAYMENTS.md).

## The core idea (read this first)

A product's shape differs per vendor type. We express those differences as **data**, not new
code, using **three orthogonal mechanisms**. Learn these three words — the whole model is them:

| Mechanism | What it is | Answers | Lives on |
|-----------|-----------|---------|----------|
| **Attribute** | A descriptive spec, defined by the product's **category** | "utensil capacity = 5L", "shirt material = cotton" | `category.attributeSchema` defines it; `product.attributes` holds the value |
| **Variant** | A distinct **purchasable SKU** with its own price + stock | grocery **500g vs 1000g**, clothes **S/M/L × color** | `product.variants[]` |
| **Modifier** | A **per-line add-on** chosen at cart time that changes price; not a separate SKU | pizza **extra cheese +₹50**, **double cheese +₹90** | `product.modifierGroups[]` |

Decision rule when modelling a new product:
- Is it a *fact about the product* used for filtering/search? → **attribute**.
- Is it a *separately stocked, separately priced unit*? → **variant**.
- Is it an *optional customization applied at order time*? → **modifier**.

## How each example maps

| Vendor | Example | Attributes | Variants | Modifiers |
|--------|---------|-----------|----------|-----------|
| Food | Pizza | cuisine=Italian, veg=true | Size: Small/Medium/Large (each own price) | Cheese group: Extra +50, Double +90; Toppings (multi) |
| Grocery | Basmati rice | brand=X, organic=false | Weight: 500g ₹60 / 1000g ₹110 | — |
| Utensils | Steel container | material=steel, **capacity attr** | Capacity: 2L / 5L (if separately sold) | — |
| Clothes | T-shirt | material=cotton, fit=slim | Size × Color matrix | — |
| Oil | Sunflower oil | type=refined | Pack: 1L / 5L | — |
| Third-party | BookMyShow event | genre, language, city | Ticket tier: Silver/Gold/Platinum | Seat add-ons |

**One model. Every case covered.** No per-vendor tables.

## Type safety over a schemaless DB

MongoDB won't enforce shape. We enforce it in **two layers**:

1. **Static** — the *structure* (a product has variants, a variant has price:number) is a Zod
   schema in `shared/`, giving compile-time TS types everywhere.
2. **Dynamic** — the *category-specific attribute values* are validated at write time by a
   validator **built from `category.attributeSchema`**. So a "utensil" product is rejected if
   `capacity` is missing or non-numeric, even though the DB itself is flexible.

```ts
// Build an ad-hoc Zod validator from a category's attribute definitions, then parse.
function attributeValidator(defs: AttributeDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const d of defs) {
    let f: z.ZodTypeAny =
      d.type === "number" ? z.number()
      : d.type === "boolean" ? z.boolean()
      : d.type === "enum" ? z.enum(d.options as [string, ...string[]])
      : d.type === "multi-enum" ? z.array(z.enum(d.options as [string, ...string[]]))
      : z.string();
    if (d.type === "number" && d.min != null) f = (f as z.ZodNumber).min(d.min);
    if (d.type === "number" && d.max != null) f = (f as z.ZodNumber).max(d.max);
    shape[d.key] = d.required ? f : f.optional();
  }
  return z.object(shape).strict();      // reject unknown attribute keys
}
// products.service.create(): attributeValidator(category.attributeSchema).parse(input.attributes)
```

This is the mechanism that makes it "dynamic **and** type-safe" — the schema is data, but
nothing invalid is ever stored.

## Collections

Money is stored in **minor units (integers, e.g. paise)** everywhere. Never floats.

### `users`
```
{ _id, name, email (unique), phone, passwordHash,
  role: "super_admin"|"admin"|"vendor"|"customer",
  storeId?,                         // set for vendor owner + vendor staff
  customPermissions?: { add: string[], remove: string[] },  // overrides on top of role
  status: "active"|"suspended"|"invited",
  createdAt, updatedAt }
```

### `roles`  (permission bundles — editable by super_admin)
```
{ _id, key, name, scope: "platform"|"store",
  permissions: string[],            // e.g. ["product:create","order:read"]
  isSystem: boolean }               // system roles can't be deleted
```

### `stores`  (a vendor)
```
{ _id, ownerId, name, slug (unique), vendorType: "food"|"grocery"|"fashion"|"generic"|"integration",
  status: "pending"|"approved"|"suspended"|"rejected",
  description, logo, banner, address, geo,
  commissionOverride?: { type:"percent"|"flat", value:number },  // else platform default
  payment: { connectedAccountId?, payoutsEnabled:boolean },
  integration?: { provider:"bookmyshow"|..., config, lastSyncedAt },  // for API vendors
  ratingAvg, ratingCount, createdAt, updatedAt }
```

### `categories`  (catalog tree **and** attribute-schema owner)
```
{ _id, name, slug, parentId?,        // tree
  appliesTo: "food"|"grocery"|"fashion"|"generic"|... ,
  attributeSchema: AttributeDef[],   // defines allowed/required attributes for its products
  variantAxes?: string[],            // which option names generate variants, e.g. ["size","color"]
  createdAt, updatedAt }

AttributeDef = {
  key, label,
  type: "string"|"number"|"boolean"|"enum"|"multi-enum",
  required: boolean,
  unit?: string,                     // "g"|"ml"|"L"|"cm"...
  options?: string[],                // for enum / multi-enum
  min?: number, max?: number,        // for number
  filterable?: boolean,              // expose as a storefront filter
  searchable?: boolean }
```
> Category schemas are managed by super_admin (or a permitted admin) in the dashboard — see
> [04-RBAC.md](04-RBAC.md) `category:manage`. Adding a new vendor type = adding categories +
> attribute defs. **No code change.**

### `products`
```
{ _id, storeId, categoryId,
  title, slug, description, brand, images: string[],
  attributes: Record<string, unknown>,   // validated against category.attributeSchema
  hasVariants: boolean,
  variants: Variant[],                    // >=1 always; simple product = single default variant
  modifierGroups: ModifierGroup[],        // usually food; [] otherwise
  status: "draft"|"active"|"archived",
  visibility: "public"|"hidden",
  ratingAvg, ratingCount,
  createdAt, updatedAt }

Variant = {
  _id, sku, optionValues: Record<string,string>,  // { weight:"500g" } or { size:"M", color:"Red" }
  price: number,                 // minor units
  compareAtPrice?: number,       // for "was ₹X"
  currency: string,              // "INR"
  stock: number,
  trackInventory: boolean,
  barcode?, image?, weightGrams? }

ModifierGroup = {
  _id, name,                     // "Cheese", "Toppings"
  selection: "single"|"multi",
  required: boolean,
  min?: number, max?: number,    // for multi
  options: { _id, name, priceDelta: number }[] }   // "Extra Cheese" +5000 (paise)
```

**Pricing rule:** a cart line's unit price = `variant.price + Σ(chosen modifier priceDelta)`.
Line total = unit price × qty. This is computed **server-side at add-to-cart and again at
checkout** — never trust a client-sent price.

### `carts`
```
{ _id, customerId (or guest sessionId),
  items: [{ productId, variantId, qty,
            selectedModifiers: [{ groupId, optionId }],
            unitPriceSnapshot, storeId }],
  updatedAt }
```
Cart may contain items from **multiple stores** — that's the whole point of a marketplace.

### `orders`  +  `subOrders`
The order is split by store into sub-orders (fulfilled + settled independently).
```
orders = {
  _id, orderNumber, customerId,
  status: "pending"|"paid"|"partially_fulfilled"|"fulfilled"|"cancelled"|"refunded",
  currency,
  amounts: { itemsTotal, delivery, tax, discount, grandTotal },  // all minor units
  payment: { provider, intentId, chargeId, status },
  shippingAddress, contact,
  createdAt, updatedAt }

subOrders = {
  _id, orderId, storeId,
  status: "pending"|"accepted"|"preparing"|"ready"|"shipped"|"delivered"|"cancelled"|"refunded",
  items: [{ productId, variantId, title, sku, qty, unitPrice, modifiers:[{name,priceDelta}], lineTotal }],
  amounts: { itemsTotal, delivery, tax, discount, subtotal },
  commission: { type, rate, amount },   // SNAPSHOT at order time — never recomputed later
  vendorPayable: number,                // subtotal - commission (+/- adjustments)
  fulfillment: { method:"delivery"|"pickup", trackingRef?, timeline:[{status, at}] },
  externalRef?,                          // for integration vendors (booking id)
  createdAt, updatedAt }
```
> Why sub-orders: each vendor accepts/prepares/ships and gets paid separately, and one
> vendor cancelling doesn't nuke the whole order. Same pattern proven in duka's suborders.

### Ledger, payouts, reviews, notifications, auditLog
Defined in [05-PAYMENTS.md](05-PAYMENTS.md) (`ledgerEntries`, `payouts`, `walletBalances`) and
[07-CONVENTIONS.md](07-CONVENTIONS.md) (`auditLog`). `reviews = { productId, storeId, customerId,
orderId, rating, text, status }`. `notifications` mirror queued messages.

## Indexes (essentials)

- `users.email` unique; `stores.slug` unique; `categories.slug` unique.
- `products`: `{ storeId, status }`, `{ categoryId }`, text index on `title/description`,
  and per-attribute indexes for `filterable` attributes (or use a search engine — below).
- `subOrders`: `{ storeId, status }`, `{ orderId }`.
- `ledgerEntries`: `{ storeId, createdAt }`, `{ orderId }`.
- **Idempotency:** unique index on `paymentEvents.eventId` and `subOrders`+claim keys to stop
  duplicate webhook/callback processing (the duka duplicate-suborder lesson — enforce at DB level).

## Search & filtering

Start with Mongo text + attribute indexes. When catalog grows, move search/filter/facets to
**MeiliSearch or OpenSearch**, indexing `title, attributes(filterable), price, storeId,
category`. Keep Mongo as source of truth; search engine is a projection.

## Third-party / integration vendors

An "integration" store has no hand-entered products. A scheduled `catalog-sync` job calls the
`IntegrationProvider.syncCatalog()` adapter and **upserts products** in the same shape as
above (tiers → variants, seat add-ons → modifiers). At checkout, that sub-order's fulfillment
calls `IntegrationProvider.purchase()` and stores the returned `externalRef`. To the rest of
the system it is just another vendor. See adapter interface in [02-ARCHITECTURE.md](02-ARCHITECTURE.md).
