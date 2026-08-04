# 10 — AI Customer Support (RAG chatbot + admin assist)

> An AI support assistant across **all three surfaces** (Flutter app, customer web, admin
> dashboard). The bot answers order questions with RAG + tool-calls, does **safe** self-service
> only, and **escalates** anything privileged to a human — where the admin gets an AI-drafted
> reply with intent + sentiment and sends it **manually (auto opt-in)**.
> Links: [overview](01-OVERVIEW.md) · [architecture](02-ARCHITECTURE.md) · [RBAC](04-RBAC.md) ·
> [payments/refunds](05-PAYMENTS.md) · [flutter](09-FLUTTER-APP.md) · [conventions](07-CONVENTIONS.md).

## 1. What we are building (decisions locked)

| Decision | Choice | Consequence |
|----------|--------|-------------|
| Bot capability | **Inform + safe self-service** | Bot answers/tracks, and performs only actions the customer could already do in the UI (cancel-if-unshipped, invoice, reorder). **Any money-out / policy exception → escalate.** |
| Escalated reply | **Manual, auto opt-in** | Admin reviews the AI draft and sends with one click. Auto-send switchable ON per intent when confidence is high and risk is low. |
| RAG store | **Atlas Vector Search (prod), Mongo-cosine (dev)** | Mirror the existing `SEARCH_ENGINE` adapter: `VECTOR_ENGINE=mongo` (in-app cosine, works on community Mongo, dev default) or `atlas` (`$vectorSearch`). |
| LLM provider | **OpenAI, via a swappable `AiProvider` adapter** | Same shape as `EmailProvider`/`PaymentProvider`. Console/stub fallback when no key, so the app boots without a key. |

## 2. The core principle: the guardrail is structural, not a prompt

The bot **is not a privileged actor**. It executes tool-calls **as the signed-in customer**,
through the same `authenticate → authorize → scopeToStore` chain every other request uses. So
"the bot can't issue a refund" is true because **`order:refund` is an admin-only permission
(see [RBAC](04-RBAC.md)) and the customer's token never has it** — not because we asked the model
nicely. A jailbroken prompt still hits a `403`. This is Rule 5 ("the API is the security boundary").

```
Customer message
   │
   ▼
┌─────────────────────────────────────────────────────────────┐
│ Orchestrator (support.service)                               │
│  1. retrieve()  → KB chunks (RAG) grounded to policies/FAQ   │
│  2. LLM plans → picks a TOOL from the customer's allow-list  │
│  3. tool runs through authorize()+scopeToStore (as customer) │
│  4. LLM answers from tool result + retrieved chunks ONLY     │
└─────────────────────────────────────────────────────────────┘
   │                                   │
   │ resolved (Tier 1)                 │ blocked / low-confidence / upset (Tier 2)
   ▼                                   ▼
 reply to customer            open SupportTicket → admin inbox
                              (intent + sentiment + AI-drafted reply)
```

**Tier 1 (self-serve, no human):** informational answers + safe mutations the customer owns.
**Tier 2 (escalate):** the model calls the sentinel tool `escalate_to_support` whenever the
ask needs a permission it doesn't have, policy is ambiguous, confidence is low, or sentiment is
negative. Escalation is the *only* way a privileged action ever happens — through a human.

### Tool allow-list (the customer's own capabilities) — IMPLEMENTED

Lives in `backend/src/modules/support/tools/registry.ts`. Every rule is enforced in code:
identity comes from the **JWT (`ctx.user.id`), never from tool args**; ownership is re-checked on
every access; a non-owned/missing id returns the same `ORDER_NOT_FOUND` (no existence oracle);
admin feature-flags gate **both** exposure to the model and execution; the one mutation delegates
to the already-guarded `ordersService.cancel`; args are Zod-validated.

| Tool | Reads/Writes | Guard (in registry.ts) |
|------|--------------|-------|
| `get_my_orders`, `get_order(id)` | read | filtered to `customerId === user.id` |
| `track_order(id)` | read | own order only; flag `selfService.trackOrder` |
| `get_invoice(id)` | read | own order only; flag `selfService.viewInvoice` |
| `cancel_order(id)` | **write, safe** | delegates to `ordersService.cancel` (own + state-machine + restock + idempotent). Not self-cancellable (e.g. paid) → **auto-escalate**. Flag `selfService.cancelUnshipped` |
| `reorder(id)` | read | returns items to rebuild the cart; no order placed. Flag `selfService.reorder` |
| `get_policy(topic)` | read (RAG) | KB retrieval — **arrives with S2b** |
| `escalate_to_support(reason, summary)` | write | **the refund/exception path** — opens a ticket, never mutates money |

`refund`, post-ship cancel, price adjustment, address change on a shipped order, account
deletion → **no tool exists**. The model can only `escalate_to_support`. Verified by a 9-case
anti-fraud test (cross-customer access, paid-order self-cancel, invented tools, injected ids,
feature-flag off, and "no money-moving tool exists" — all held).

## 3. AI provider adapter (`backend/src/providers/ai/`)

Same swappable pattern as `providers/email`. One interface, an OpenAI impl, a stub fallback.

```ts
export interface AiProvider {
  chat(opts: ChatOpts): Promise<ChatResult>;        // tool-calling chat completion
  embed(texts: string[]): Promise<number[][]>;      // for RAG indexing + query
  classify(text: string): Promise<{ intent: SupportIntent; sentiment: Sentiment; urgency: 1|2|3 }>;
}
// default: openaiProvider (gpt-4o-mini class for chat, text-embedding-3-small for embed)
// fallback: stubProvider — deterministic canned replies + zero-vector, so dev boots keyless
export const aiProvider: AiProvider = env.OPENAI_API_KEY ? openaiProvider : stubProvider;
```

- **Grounding:** system prompt forces "answer only from retrieved context + tool results; if not
  found, escalate. Never invent order facts, prices, or policy." Retrieved chunks + tool JSON are
  the *only* factual sources; the model may not use its own knowledge for order/policy facts.
- **Cost/latency:** chat + classify batched where possible; embeddings created in a **BullMQ
  worker** (never inline). Per-user rate limit on the chat endpoint.
- Provider stays behind the interface so we can swap OpenAI → Anthropic/local without touching the
  orchestrator (matches your Node + OpenAI stack; adapter keeps the door open).

## 4. RAG: knowledge base + retriever (mirror `SEARCH_ENGINE`)

Two retrieval sources, combined per turn:
1. **Structured (authoritative):** the customer's own orders/returns via **tool-calls** — always
   live, never embedded (money/status facts must not be stale).
2. **Semantic KB (RAG):** platform + per-store **policy/FAQ/how-to docs**, embedded and chunked.

```ts
// backend/src/providers/ai/retriever.ts  — same idea as search.module.ts:85
export const retriever: Retriever =
  env.VECTOR_ENGINE === 'atlas' ? atlasVectorRetriever : mongoCosineRetriever;
```

| Engine | How | When |
|--------|-----|------|
| `mongo` (default) | embeddings stored as `number[]` on a `KbChunk` doc; cosine similarity computed in Node over candidate chunks | local/dev, community Mongo, small–mid KB |
| `atlas` | `$vectorSearch` over an Atlas vector index on `KbChunk.embedding` | prod, large KB |

**KB content** (seeded + admin-editable): return/refund policy, shipping, cancellation windows,
payment/wallet FAQ, per-store policies, product care docs. Reindex job re-embeds on edit.
KB is **store-scoped** where relevant (rule 7): a query about store X retrieves X's policies + global.

## 5. Data model (`backend/src/modules/support/`)

Follows `route → controller → service → model`, Zod at the edge, types in `shared/`.

```
SupportThread                         one per (customer × topic); the chat transcript
  _id, customerId, storeId?, orderId?         context anchors
  channel: 'app'|'web'|'admin'
  status: 'bot'|'open'|'pending_admin'|'resolved'|'closed'
  messages: [SupportMessage]
    { role:'customer'|'bot'|'agent'|'system', text, toolCalls?, at, agentId? }
  ticketId?                                   set when escalated

SupportTicket                         the escalation the admin acts on
  _id, threadId, customerId, storeId?, orderId?
  intent: SupportIntent                       enum (refund_request, where_is_order, ...)
  sentiment: 'positive'|'neutral'|'negative'|'angry'
  urgency: 1|2|3
  summary                                     one-line AI TL;DR of what they want
  suggestedReply                              AI draft (grounded), regenerable
  suggestedConfidence: number                 0..1 → gates auto-send
  assigneeId?, status, resolution?, slaDueAt
  audit: who sent, manual|auto, edited?       feeds auditLog on send

KbDoc / KbChunk                       the RAG knowledge base
  KbDoc:   _id, storeId?, title, body(markdown), tags, updatedBy, version
  KbChunk: _id, docId, storeId?, text, embedding:number[], atlas vector index

SupportConfig  (extends Settings singleton + optional per-store override)
  botEnabled, greeting, handoffMessage
  autoReply: { enabled, byIntent: { [intent]: bool }, minConfidence, businessHoursOnly }
  slaMinutes, escalationChannels
```

Money still moves **only** through the existing refund/order flow with its ledger + idempotency
([payments](05-PAYMENTS.md)); a ticket resolution that grants a refund *calls that flow* under an
admin actor — the support module never writes the ledger itself.

## 6. Permissions (add to `shared/permissions.ts`)

| Permission | Who (default) | Purpose |
|------------|---------------|---------|
| `support:read` | admin, vendor (own store) | view tickets/threads |
| `support:reply` | admin, vendor (own store) | send a reply to a customer |
| `support:assign` | admin | assign/resolve tickets |
| `support:config` | admin | toggle auto-reply, SLAs, greeting |
| `kb:manage` | admin, vendor (own store, own docs) | create/edit KB docs |

Customers need **no** new permission — the bot rides their existing storefront token. Vendor
tickets are **store-scoped** (rule 7): a vendor sees only tickets where `storeId === their store`.
Sending a reply and any auto-send both write an `auditLog` entry ([RBAC §Audit](04-RBAC.md)).

## 7. Escalation, intent & sentiment, suggested reply

On `escalate_to_support` (or a Tier-2 trigger):
1. `aiProvider.classify(transcript)` → `{ intent, sentiment, urgency }`.
2. Build `summary` + `suggestedReply` grounded in the same RAG chunks + order tool data, with a
   `suggestedConfidence`.
3. Create `SupportTicket`, set thread `status='pending_admin'`, emit `SUPPORT_TICKET_NEW` to the
   admin room (+ owning store room).
4. Tell the customer: handoff message ("a specialist will get back to you"), thread stays live.

**Admin inbox** shows the transcript, the intent/sentiment/urgency chips, the editable draft, and
a "regenerate" button. The draft is a *suggestion*, always human-overridable.

## 8. Manual vs auto reply

- **Manual (default):** admin edits/approves → `POST /support/tickets/:id/reply` → message pushed
  to the customer over sockets + notification; ticket → `resolved` (or `open` if follow-up).
- **Auto opt-in:** if `autoReply.enabled` **and** `byIntent[intent]` **and**
  `suggestedConfidence ≥ minConfidence` **and** (businessHours rule ok) → the reply auto-sends,
  flagged `sentBy:'auto'`, admin notified, **undo window** before it's final. Refund/exception
  intents are **excluded from auto** by default. Everything logged to `auditLog`.

## 9. Realtime & API surface

Reuse `CHAT_MESSAGE`; add support events to `shared/events` (typed, per convention):

```
SUPPORT_MESSAGE      thread message (customer↔bot↔agent)   → thread participants
SUPPORT_TICKET_NEW   escalation created                    → admin room + store room
SUPPORT_TICKET_UPDATED  status/assignee/reply              → admin + customer
SUPPORT_TYPING       agent/bot typing indicator            → thread
```

Endpoints (mounted `/support` in `routes.loader.ts`):

```
# Customer (storefront token)
POST /support/threads                 start/get my thread (optional orderId context)
POST /support/threads/:id/message     send a message → bot turn (SSE/stream or JSON)
GET  /support/threads/:id             my transcript

# Admin/vendor (support:* perms, store-scoped)
GET  /support/tickets                 inbox (filter: status, intent, sentiment, store)
GET  /support/tickets/:id             ticket + thread + AI analysis
POST /support/tickets/:id/reply       send reply (manual)         [support:reply]
POST /support/tickets/:id/regenerate  new AI draft                [support:reply]
POST /support/tickets/:id/assign      assign/resolve/close        [support:assign]

# KB
GET/POST/PUT/DELETE /support/kb       manage docs (reindex on write) [kb:manage]

# Config
GET/PUT /support/config               bot + auto-reply settings      [support:config]
```

## 10. Surface integration (all three)

- **`customer_app` (Flutter):** a `features/support/` chat screen + FAB, using
  `core/api/api_client.dart` and the socket client; bot greeting/enabled read from **AppConfig**
  (`support.*`) so it themes with `context.brand` and can be toggled without a rebuild
  ([flutter](09-FLUTTER-APP.md)).
- **`customerfacing` (Angular SSR):** a floating chat widget (client-only, not SSR'd), NgRx
  `support` feature slice, sockets dispatch actions ([structure](08-STRUCTURE.md)).
- **`adminDashboard` (Angular):** a **Support inbox** feature (list + detail), sidebar item gated
  by `support:read` via `GET /me/navigation`; intent/sentiment chips, draft editor, manual-send /
  auto-toggle, KB manager. NgRx `support` slice; `SUPPORT_TICKET_NEW` raises a toast + badge.

## 11. Safety & guardrails

- **Prompt-injection / jailbreak:** irrelevant to authz (structural guard §2); still, tool args
  are Zod-validated and RAG context is fenced/labelled as untrusted data.
- **Grounding:** no order/policy fact without a tool result or retrieved chunk; otherwise escalate.
- **PII:** transcripts store only what the customer sent; redact card/OTP-looking tokens before
  embedding; never embed order PII into the KB.
- **Cost/DoS:** per-user chat rate limit, max tokens, embeddings off the request path (BullMQ).
- **Kill switch:** `SupportConfig.botEnabled=false` → every message goes straight to a human.

## 12. Env additions (`.env.example` + `config/env.ts`)

```
OPENAI_API_KEY=                 # empty → stubProvider (dev boots keyless)
AI_CHAT_MODEL=gpt-4o-mini
AI_EMBED_MODEL=text-embedding-3-small
VECTOR_ENGINE=mongo             # 'mongo' (dev/community) | 'atlas' (prod $vectorSearch)
SUPPORT_RATE_PER_MIN=20
```

## 13. Phased build (each phase independently shippable)

```
[ ] S1  Backend spine      support module (thread/ticket/message models, Zod, routes),
                           permissions + nav, AiProvider adapter w/ stub, config endpoints.
[ ] S2  Bot Tier-1         orchestrator: RAG retriever (mongo-cosine) + order tool-calls +
                           grounded answers; KbDoc/KbChunk + reindex worker; seed policy KB.
[ ] S3  Escalation         escalate tool, classify (intent/sentiment/urgency), ticket
                           creation, suggestedReply, admin sockets.
[ ] S4  Admin inbox        adminDashboard support feature: list/detail, chips, draft editor,
                           manual reply, assign/resolve, KB manager.
[ ] S5  Auto opt-in        SupportConfig auto-reply (per-intent + confidence gate + undo),
                           audit, business-hours rule.
[ ] S6  Customer surfaces  Flutter chat + customerfacing widget; AppConfig support toggle.
[ ] S7  Prod RAG + harden  Atlas vector index + atlasVectorRetriever, rate limits, PII
                           redaction, load/cost test, kill switch, tests.
```

**Exit:** a customer asks "where's my order / can I return this", the bot answers from live order
data + policy; a refund request opens a ticket with intent + sentiment + a grounded draft; the
admin one-click sends (or auto-send fires for a low-risk intent) — across app, web, and dashboard.
