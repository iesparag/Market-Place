# 05 — Payments, Commission & Payouts ★

> How money flows so vendors get paid and the platform earns commission — safely. Links: [overview](01-OVERVIEW.md) · [data model](03-DATA-MODEL.md).

## The business model

We are a **marketplace / merchant-of-record**. The customer pays **us** for the whole cart.
For each vendor's slice we keep a **commission** and owe the vendor a **payable**. We settle
vendors on a schedule via **payouts**. Every rupee is tracked in a **double-entry ledger** so
balances are always provable, and every handler is **idempotent** so nothing is processed twice.

```
Customer pays ₹1000 (cart from Vendor A ₹600 + Vendor B ₹400)
        │
        ▼   platform collects ₹1000
   ┌─────────────────────────────────────────────┐
   │  split per vendor + snapshot commission       │
   │  A: subtotal 600, commission 15% = 90  → payable 510 │
   │  B: subtotal 400, commission 20% = 80  → payable 320 │
   │  platform commission earned = 170                    │
   └─────────────────────────────────────────────┘
        │  ledger entries written on payment success
        ▼
   payout job (T+n days / on delivery) → transfer 510 to A, 320 to B
```

## Provider abstraction (swap Stripe ↔ Razorpay ↔ Selcom)

All money operations go through the `PaymentProvider` interface (see
[02-ARCHITECTURE.md](02-ARCHITECTURE.md)). **Reference implementation = Stripe Connect**;
the adapter means we can later swap to **Razorpay Route**, **PayPal Marketplace**, or
**Selcom's own gateway** without touching order/ledger logic.

Two Stripe Connect strategies (pick per go-live region):
- **Destination charges + `application_fee_amount`** — one charge, Stripe auto-splits the fee
  to the platform and the rest to the connected account. Simplest for single-vendor carts.
- **Separate charges & transfers** — platform charges the customer, then issues **transfers**
  to each vendor's connected account. Needed for **multi-vendor carts** (our default), because
  one payment funds several vendors.

We default to **separate charges & transfers** since carts are multi-vendor.

## Commission engine

Commission is resolved at **order time** with this precedence and then **snapshotted** onto
the sub-order (so later rate changes never rewrite history):

```
store.commissionOverride  ??  category.commission  ??  platform.defaultCommission
```

Each rule: `{ type: "percent" | "flat" | "tiered", value, min?, max? }`. Tiered example:
15% up to ₹10k/mo, 12% above. Managed by `commission:manage` (super_admin/finance admin).

`commissionAmount = round(subtotal * rate)` (percent) — computed in integer minor units,
rounding documented and consistent. `vendorPayable = subtotal − commissionAmount ± adjustments`
(refunds, chargebacks, promo funded-by-platform, delivery handling).

## Double-entry ledger

Single source of financial truth. **Every** money event writes balanced entries
(Σ debits = Σ credits). Vendor balance is *derived* from the ledger, not stored as a mutable
number you can accidentally corrupt.

```
ledgerEntries = {
  _id, at, orderId?, subOrderId?, storeId?, payoutId?,
  account: "customer_receivable" | "platform_cash" | "platform_commission_income"
         | "vendor_payable" | "vendor_paid" | "refunds" | "fees",
  direction: "debit" | "credit",
  amount: number,           // minor units, always positive
  currency,
  refType, refId,           // for traceability
  idempotencyKey (unique) } // stops double-writes
```

Example — payment success for sub-order A (subtotal 600, commission 90, payable 510):
```
credit platform_cash            600
debit  customer_receivable      600
credit platform_commission_inc   90
debit  vendor_payable            90   ← reduce what we owe by our cut
(net vendor_payable owed = 510)
```
Balances (materialized view / aggregation, cached in `walletBalances`):
`vendor available = Σ(vendor_payable credits) − Σ(vendor_paid) − holds`.

## Order → money lifecycle

1. **Checkout** (`order:create`): server recomputes every line price from DB
   (`variant.price + Σ modifier deltas`), builds **sub-orders per store**, computes tax/
   delivery/discount, snapshots commission per sub-order. Never trust client prices.
2. **Create payment intent** via provider for `grandTotal`. Return client secret.
3. **Customer pays.** Provider sends a **webhook**.
4. **Webhook handler** (idempotent — see below): mark `order.paid`, write ledger entries,
   accrue `vendor_payable`, notify vendors, enqueue fulfillment.
5. **Fulfillment** per sub-order (vendor accepts → prepares → ships/delivers, or integration
   `purchase()`), status timeline updated.
6. **Settlement window** (e.g. T+2 after delivery, configurable) makes payable **releasable**.
7. **Payout job** batches releasable balances → `provider.payout()` / transfer → write
   `vendor_paid` ledger entries + `payouts` record → email statement.
8. **Refund/cancel** (`order:refund`): provider refund + **reverse** the sub-order's ledger
   entries and **claw back commission proportionally**; if already paid out, create a negative
   balance / debt recovered from next payout.

```
payouts = { _id, storeId, amount, currency, status:"pending"|"paid"|"failed",
            method, providerRef, periodStart, periodEnd, ledgerEntryIds[], createdAt }
walletBalances = { storeId, available, pending, lifetimeEarned, lifetimePaid, updatedAt } // cache of ledger
```

## Idempotency (the duka lesson — enforce hard)

We previously hit **duplicate callbacks → duplicate sub-orders → double actions** in duka.
Never again. Rules:

- Every provider webhook has a unique `event.id`. Persist it in `paymentEvents` with a
  **unique index**; on duplicate, **ack and no-op**. Process inside a transaction/atomic claim.
- Every ledger write carries an `idempotencyKey` (unique index) derived from
  `{eventId, account, refId}` so a retry cannot double-post.
- Outbound provider calls (createIntent, payout, refund) pass an **idempotency key** so
  network retries don't double-charge/double-pay.
- Webhook processing runs on the **queue** with at-least-once delivery + idempotent workers.
- **Reconciliation job** (daily): compare provider balance/transactions vs our ledger; alert
  on drift.

## Taxes, fees, currency

- Store amounts in **minor units, integers**, single currency to start (INR). Multi-currency
  later = per-store currency + FX at capture; keep the field now, defer the logic.
- Tax (GST) computed per line/vendor; who remits (platform vs vendor) is a policy flag on the
  store. Provider fees recorded to the `fees` ledger account so payouts net correctly.

## Security

- Verify **every** webhook signature (`provider.verifyWebhook`) before trusting it.
- PCI: never touch raw card data — use the provider's hosted fields / Payment Element.
- KYC/onboarding for vendors is handled by the provider's connected-account flow before
  `payoutsEnabled = true`.
- All payout/refund/commission actions are permission-gated + written to `auditLog`.

## What to build in what order

Payments is Phase 3–5 in the [roadmap](06-ROADMAP.md): first single-vendor happy path
(intent → webhook → ledger), then multi-vendor split + sub-orders, then commission engine,
then payouts + reconciliation, then refunds/edge cases.
