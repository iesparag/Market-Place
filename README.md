# Multi-Vendor Marketplace — Planning Workspace

This folder holds the **complete plan** for a multi-vendor e-commerce platform before any
code is written. Nothing here is code yet — it is the blueprint we build from.

## The idea in one line

A marketplace where many vendors (food, grocery, clothes, oil, utensils, and third-party
APIs) sell on **our** platform. Customers shop across vendors in one cart. We charge a
**commission** and pay vendors out. Everything is **dynamic per vendor type** but stays
**type-safe**.

## How this workspace is organised

```
marketplace/
├── CLAUDE.md              ← always-load rules + "which doc do I read" router
├── README.md             ← you are here
├── docs/                 ← shared specs (read by all three apps, written once)
│   ├── 01-OVERVIEW.md        vision, actors, glossary, decisions
│   ├── 02-ARCHITECTURE.md    stack, monorepo, how the apps connect
│   ├── 03-DATA-MODEL.md      MongoDB collections + the flexible product model ★
│   ├── 04-RBAC.md            roles, permissions, scoping, dynamic sidebar
│   ├── 05-PAYMENTS.md        commission, ledger, payouts, refunds ★
│   ├── 06-ROADMAP.md         phased delivery plan + master checklist
│   └── 07-CONVENTIONS.md     naming, git, testing, API envelope, error format
├── backend/PLAN.md       ← Node/Express/Mongo build plan (links to docs/)
├── adminDashboard/PLAN.md← React/Vite admin build plan (links to docs/)
└── customerfacing/PLAN.md← Next.js storefront build plan (links to docs/)
```

★ = the two hardest / most important specs.

## Why this structure (the "join together, low-token" design)

- **Shared concepts live once in `docs/`.** The three app plans **link** to them instead of
  repeating them. When we work on the backend we read `backend/PLAN.md` + the 2–3 relevant
  `docs/` files — not the whole workspace.
- **`CLAUDE.md` is the router.** It tells us exactly which file to open for a given task, so
  we never load everything and burn tokens.
- **Types are shared in code too.** The `shared/` package is the code-level version of this
  same rule: define a type once, import it everywhere. See `docs/02-ARCHITECTURE.md`.

## Reading order (first time)

1. `docs/01-OVERVIEW.md` — understand the whole thing.
2. `docs/02-ARCHITECTURE.md` — understand how the pieces fit.
3. `docs/03-DATA-MODEL.md` — understand the product model (the clever part).
4. Skim `04`, `05`, `06`, `07`.
5. Then dive into the app you're building via its `PLAN.md`.
