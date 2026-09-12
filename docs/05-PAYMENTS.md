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

## Provider abstraction — **Razorpay** (built)

All money operations go through the `PaymentProvider` interface in
`backend/src/providers/payment/types.ts`, so the gateway can be swapped without touching
orders, ledger or payouts.

**Live implementation = Razorpay** (`razorpay.provider.ts`), chosen for India:
UPI (GPay/PhonePe/Paytm/any app), cards, netbanking and wallets in one sheet; no monthly
fee; ~2% on cards and materially cheaper on UPI; official Flutter SDK and web Checkout.js;
HMAC-signed webhooks. It talks to the REST API with `fetch` + `node:crypto` — no SDK
dependency to keep current.

**Dev implementation = `mock.provider.ts`**, a keyless gateway with the *same* contract.
With no `RAZORPAY_KEY_ID` set, the whole flow — checkout, signature verification, ledger,
refunds, webhooks — runs locally with no account. It is not a free pass: signatures are
still HMAC-verified and an unknown payment id is rejected, so a client cannot mark an
order paid by inventing ids. Its state lives in Mongo, so it survives a restart.

Selection is automatic (`PAYMENT_PROVIDER=auto`): Razorpay when keys are present,
mock otherwise. Force either with `PAYMENT_PROVIDER=razorpay|mock`.

### Settlement model

We use **platform-collect + ledger + manual payout**, not Razorpay Route:
the platform account collects the whole cart, the ledger records each vendor's payable and
our commission, and an admin settles vendors from the Finance screen (recording the bank
UTR). This needs no per-vendor KYC onboarding to start earning, and Route can be swapped in
later behind the same interface without any ledger change.

## Payment methods

| Method | How it settles | Notes |
|---|---|---|
| **Online** (UPI / card / netbanking / wallet) | Money reaches the platform at capture; vendor payable accrues immediately, released after the hold window | Razorpay sheet on web + app |
| **Cash on delivery** | The *vendor* collects the cash, so on delivery we credit `commission_income` and post a **negative** `vendor_payable` — the vendor owes us our cut, netted off their next payout | Admin-toggleable, with a per-order cap (`codMaxOrderValue`) |

Both are switched on/off and capped from **Admin → Settings**.

## The three idempotency guards (verified)

A payment can be reported to us twice — a client callback *and* a webhook, or a webhook
retried. Three independent layers make double-settlement impossible; a payment must pass
all three to move money:

1. **Event dedupe** — `paymentEvents` has a unique index on `(provider, eventId)`.
   A repeat delivery is recognised and acked as a no-op.
2. **Payment claim** — flipping a payment to `paid` is a single conditional
   `findOneAndUpdate`. Whoever loses the race gets `null` and writes nothing. This catches
   duplicates that bypass layer 1 entirely (e.g. two *different* event ids for one payment).
3. **Ledger key** — every entry carries a deterministic `idempotencyKey` with a unique
   index, so even a replayed settle cannot double-post.

Verified end to end: 5 concurrent signed confirmations + 4 webhook replays (3 with fresh
event ids) against one order produced **exactly 3 ledger rows**.

## Payout holds

`vendor_payable` credits carry an `availableAt` = paid time + `payoutHoldDays`. A wallet
reports `available` (releasable now) separately from `pending` (still on hold), and a payout
can never draw more than `available`. Entries written before this field existed are treated
as available.

## Abandoned orders

Placing an order decrements stock. Now that payment can fail or be abandoned, a sweeper
(`jobs/schedulers/payment-expiry.ts`, every 5 min) cancels unpaid **online** orders older
than `paymentExpiryMinutes` (default 30) and returns their stock. COD orders are never
touched — they are legitimately unpaid until delivery. The cancel is an atomic claim, so a
payment landing at that instant always wins. The customer gets both a bell notification and
a `payment_expired` email (`order-email.ts`) so an abandoned/"keep shopping" checkout doesn't
go silent — they're told the order was cancelled and stock was released, not left thinking
their earlier "order placed" email meant it went through.

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
  _id, at, orderId?, storeId?,
  account: "platform_cash" | "commission_income" | "vendor_payable" | "vendor_paid" | "refund",
  amount: number,           // minor units; NEGATIVE = reversal / clawback
  availableAt?: Date,       // when a vendor_payable credit leaves the payout hold
  currency, refType, refId, note,
  idempotencyKey (unique) } // stops double-writes
```

Signed amounts (rather than a separate `direction` field) keep reversals trivial: a refund
posts the same account with a negative amount, and every balance is a plain `$sum`.

Example — a ₹1000 cart paid online, vendor A ₹600 @ 15%, vendor B ₹400 @ 20%:
```
platform_cash        +1000        we collected the whole cart
vendor_payable  (A)   +510        owed to A, availableAt = paid + holdDays
commission_income(A)   +90
vendor_payable  (B)   +320
commission_income(B)   +80
```
Refunding ₹200 of it reverses proportionally:
```
refund               +200
platform_cash        −200
vendor_payable  (A)  −102   commission_income (A)  −18
```
Balances are derived, never stored:
`available = Σ(vendor_payable where availableAt ≤ now) − Σ(vendor_paid)`,
`pending = Σ(vendor_payable where availableAt > now)`.

A full refund nets `vendor_payable`, `commission_income` and `platform_cash` back to
**exactly zero** — verified with two successive partial refunds, no rounding drift.

## Order → money lifecycle

1. **Place order** (`POST /orders`): the server recomputes every line price from the DB
   (`variant.price + Σ modifier deltas`), applies coupon/tax/delivery. Never trust client
   prices. The order is created **unpaid** and survives a failed payment, so an abandoned
   sheet never costs the customer their cart.
2. **Start payment** (`POST /payments/checkout`): creates a gateway order for `grandTotal`.
   Calling it again for the same order **resumes** the same gateway order rather than
   creating a second one.
3. **Customer pays** in the Razorpay sheet (web Checkout.js / Flutter SDK).
4. **Two paths converge**: the signed client handshake (`POST /payments/confirm`, fast) and
   the **webhook** (`payment.captured`, authoritative). Both call the same
   `applyGatewayPayment` → `settlePrepaid`, which is atomically claimed — so whichever
   arrives second is a no-op. Settlement marks the order paid, snapshots commission, writes
   the ledger and notifies the customer (bell + `paid` email) + each vendor. This is
   deliberately separate from the `placed` email sent at step 1 — placing an order and
   paying for it are different events, each gets its own email.
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

## Idempotency (the duka lesson — enforced)

We previously hit **duplicate callbacks → duplicate sub-orders → double actions** in duka.
The three guards above are the answer; see `payments.service.ts` (`applyGatewayPayment`),
`settlement.service.ts` (`settlePrepaid`) and `webhooks.controller.ts`.

Also enforced:
- Outbound gateway calls (create order, refund) send `X-Razorpay-Idempotency-Key`, so a
  network retry cannot create a second gateway order or send a refund twice.
- Webhooks are verified over the **raw request body** (mounted before `express.json`) and
  are exempt from the API rate limiter — a 429 would make the gateway retry a payment we
  already have.
- A webhook that throws returns **500 on purpose** so the gateway retries; the event row
  stays un-`processed` so the retry re-runs it. `GET /payments/reconcile` lists any that
  are stuck, and `POST /payments/events/:id/replay` re-runs one by hand.

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

## API surface

| Endpoint | Who | What |
|---|---|---|
| `GET /payments/methods` | public | which methods to show at checkout |
| `POST /payments/checkout` | customer | start/resume payment for an order |
| `POST /payments/confirm` | customer | verify the SDK handshake (fast path) |
| `POST /payments/mock-pay` | customer | dev gateway only; 403 when live keys are set |
| `GET /payments/order/:id` | customer/staff | payment state (polled while UPI settles) |
| `POST /api/v1/webhooks/razorpay` | gateway | signed, raw-body, idempotent (source of truth) |
| `GET /payments` | `payment:read` | admin/vendor payment list + filters |
| `GET /payments/reconcile` | `payment:read` | does the money add up + stuck webhooks |
| `POST /payments/order/:id/refund` | `order:refund` | full or partial refund |
| `POST /payments/events/:id/replay` | `payment:refund` | re-run a failed webhook |
| `GET /payouts/statement` | `wallet:read` | vendor's own ledger lines |
| `GET /payouts/balances` | `ledger:read` | every vendor's available vs held |
| `POST /payouts/release` | `payout:release` | record a settlement + its UTR |

## Going live

1. Razorpay dashboard → **Settings → API Keys** → generate **live** keys → set
   `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
2. **Settings → Webhooks** → add `https://<api-host>/api/v1/webhooks/razorpay` with a
   secret; put the same value in `RAZORPAY_WEBHOOK_SECRET`. Subscribe to
   `payment.captured`, `payment.failed`, `payment.authorized`, `order.paid`,
   `refund.created`, `refund.processed`, `refund.failed`.
3. Restart. The log line must read `Payments: Razorpay (live gateway)` — if it says
   `MOCK gateway`, the keys are not reaching the process.
4. `POST /orders/:id/pay` (the old demo endpoint) refuses to run once live keys are set.
5. Add each vendor's payout account (**Store → Payout account**) and verify it before
   settling.
