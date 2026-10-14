# AGENTS.md — Makhzan

Read this file before writing, changing or suggesting any code.
These rules are about correctness. Design freedom is covered in the UI section.

---

## Project

**Makhzan** (مخزن) is a multi-tenant inventory management SaaS for small and medium businesses in the MENA region.

- Each business (tenant) manages its products, warehouses, suppliers, purchase orders, sales orders and stock.
- Bilingual from day one: English (`en`, default) and Arabic (`ar`, full RTL).
- AI feature: upload a supplier invoice photo or PDF, extract the line items, and pre-fill a purchase order.

### Roles (RBAC, per tenant)

| Role | Access |
|---|---|
| `OWNER` | Everything, including billing and users |
| `MANAGER` | All inventory operations and reports |
| `STAFF` | Create and receive orders, adjust stock; no settings or users |
| `VIEWER` | Read only |

---

## Stack (locked — ask before using any alternative)

| Layer | Technology |
|---|---|
| Language | TypeScript, strict mode, everywhere |
| Repo | npm workspaces monorepo: `apps/api`, `apps/web`, `packages/shared` |
| Backend | NestJS |
| Database | PostgreSQL 16 + Drizzle ORM (migrations via drizzle-kit) |
| Cache / queues | Redis 7 + BullMQ |
| Auth | Better Auth |
| Validation | Zod (schemas shared FE/BE from `packages/shared`) |
| Frontend | Next.js (App Router) |
| UI | Tailwind CSS, shadcn/ui, lucide-react |
| Server state | TanStack Query |
| Tables | TanStack Table |
| Charts | Recharts |
| i18n | next-intl |
| File storage | Cloudflare R2 (S3-compatible SDK) |
| Testing | Vitest (unit), Supertest (API e2e) |
| Local dev | Docker Compose (Postgres + Redis) |
| Package manager | npm only — no pnpm, no yarn |

### Never install

Prisma, TypeORM, Mongoose/MongoDB, Express directly (NestJS wraps it), Socket.io, Redux/MobX/Jotai, Moment.js (use `date-fns`), MUI/Ant/Chakra, styled-components/Emotion/CSS Modules, Axios in the frontend (use `fetch` through the API client).

---

## Repo structure

```
makhzan/
├── AGENTS.md
├── docker-compose.yml
├── package.json              # npm workspaces root
├── .env.example
├── apps/
│   ├── api/                  # NestJS
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       ├── db/           # Drizzle client, schema/, migrations/
│   │       ├── common/       # guards, decorators, pipes, filters, interceptors
│   │       ├── auth/
│   │       ├── tenants/
│   │       ├── products/
│   │       ├── warehouses/
│   │       ├── suppliers/
│   │       ├── inventory/    # stock levels + stock_movements ledger
│   │       ├── purchase-orders/
│   │       ├── sales-orders/
│   │       ├── uploads/      # R2 presigned URLs
│   │       ├── ai-invoice/   # invoice extraction (runs in a queue)
│   │       └── jobs/         # BullMQ processors
│   └── web/                  # Next.js
│       ├── messages/         # en.json, ar.json
│       └── src/
│           ├── app/[locale]/ # landing, auth, (dashboard)/...
│           ├── components/
│           ├── i18n/
│           └── lib/          # api-client, query hooks, utils
└── packages/
    └── shared/               # Zod schemas, constants, shared types
```

One NestJS module per domain. Controllers stay thin; business logic lives in services.

---

## Inventory rules (the core of this app — highest priority)

1. **Every stock change runs inside one database transaction** (`db.transaction(...)`).
2. **Every stock change writes a row to `stock_movements`.** The ledger is append-only: never update or delete movement rows. Corrections are new movements.
3. **Stock levels are never edited directly.** `stock_levels` (tenant, product, warehouse → quantity) is only changed in the same transaction that inserts the movement.
4. **Lock before you change.** Read the `stock_levels` row with `SELECT ... FOR UPDATE` inside the transaction, so two simultaneous sales can't both take the last unit.
5. **No negative stock** unless the tenant setting `allowNegativeStock` is on. Otherwise reject with a clear error.
6. **Movement types** live in `packages/shared/constants` as `as const`:
   `PURCHASE_RECEIPT`, `SALE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN_IN`, `RETURN_OUT`.
7. **Each movement records:** tenant, product, warehouse, type, quantity (signed), resulting balance, reference (e.g. PO or SO id), user, timestamp, optional note.
8. **Stock-changing endpoints require an `Idempotency-Key` header.** A retried request must not move stock twice.
9. **Orders follow a state machine.** Purchase order: `DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED`, or `CANCELLED`. Sales order: `DRAFT → CONFIRMED → FULFILLED`, or `CANCELLED`. Invalid transitions are rejected in the service, not only hidden in the UI.

---

## Multi-tenancy rules

- **Every table holding business data has a `tenant_id` column.**
- **`tenant_id` comes from the authenticated session, never from the request body or URL.**
- **Every query filters by `tenant_id`.** A query without it is a bug.
- Unique constraints are scoped per tenant, e.g. `UNIQUE (tenant_id, sku)`.
- Indexes on tenant tables start with `tenant_id`, e.g. `(tenant_id, created_at)`.
- Tests must include at least one "tenant A cannot read or change tenant B's data" case per module.

---

## Security

- Better Auth sessions via secure, httpOnly cookies.
- Guards on every protected route: `AuthGuard` → `TenantGuard` → `RolesGuard`. Use a `@Roles(...)` decorator.
- Every request body, query and param is validated with a Zod schema (`ZodValidationPipe`). Never trust client data.
- File uploads go **directly from the browser to R2** using short-lived presigned URLs. Files never pass through the API server.
- Never log secrets, tokens or full request bodies with personal data.
- Never commit `.env` files. Every new env variable is added to `.env.example`.

---

## Background jobs (BullMQ)

- Slow or retryable work runs in a queue, never inside the HTTP request: AI invoice extraction, low-stock alert checks, report exports, emails.
- Jobs are idempotent (safe to run twice).
- Jobs retry with backoff, and failures are logged with the job id.

---

## Money, numbers and dates

- **Money is stored as integers in minor units** (fils, halalas), never floats. Each tenant has a base currency (AED, SAR, KWD…). Use the currency's own decimals (KWD has 3).
- **Quantities** use `numeric(14,3)` to support units like kg and litres.
- **Format only for display**, never store formatted strings.
- **Western digits always**, even in Arabic UI (`12,500`, not `١٢٬٥٠٠`). Use `Intl.NumberFormat` with `numberingSystem: 'latn'`.
- Dates: store UTC (`timestamptz`); display in the tenant's timezone (default `Asia/Dubai`); format `dd/MM/yyyy`, 24-hour time.

---

## i18n and RTL (mandatory)

- **No hardcoded user-facing strings.** Every visible text goes through `t()` from next-intl.
- Add every new key to **both** `en.json` and `ar.json` in the same change.
- Don't concatenate translated strings; use ICU placeholders and plurals.
- Root layout sets `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>` and wraps the app in Radix `DirectionProvider`.
- **Logical properties only:**
  - `ms-*` / `me-*`, never `ml-*` / `mr-*`
  - `ps-*` / `pe-*`, never `pl-*` / `pr-*`
  - `start-*` / `end-*`, never `left-*` / `right-*`
  - `text-start` / `text-end`, never `text-left` / `text-right`
  - `border-s` / `border-e`, `rounded-s-*` / `rounded-e-*`
- Never use `flex-row-reverse` to fix RTL; plain `flex` already flips.
- Content that must stay LTR (SKUs, barcodes, phone numbers, emails, order numbers) uses the `.text-ltr` utility:
  ```css
  .text-ltr { direction: ltr; unicode-bidi: embed; text-align: start; }
  ```
- Fonts: a Latin font and an Arabic font loaded with `next/font`, switched by `[lang="ar"]` through a CSS variable. Never hardcode font-family in components.
- Directional icons (chevrons, arrows) flip in RTL.

---

## UI rules

| Area | Freedom |
|---|---|
| Landing / marketing page, onboarding, empty states, 404 | **High** — bold layouts, custom gradients, GSAP or staged animations |
| Dashboard overview, KPI cards, charts | **Balanced** — design tokens for UI, some freedom on hero cards |
| Tables, forms, settings, modals | **Strict** — tokens only, predictable patterns, speed over style |

- Functional colors (text, buttons, inputs, borders, states) use CSS variable tokens. Decorative colors may be hardcoded.
- Every data component handles **loading** (skeleton), **error** (message + retry) and **empty** (message + call to action).
- Tables: server-side pagination, sorting and filtering; card layout on mobile.
- Always respect `prefers-reduced-motion`. Never animate while the user types.
- Accessibility: keyboard navigation, labels on every field, visible focus rings, 4.5:1 contrast, 44px touch targets.
- All hooks before any early return.

---

## State management

- **API data → TanStack Query only.** Never copy API responses into other state.
- **Local UI state → `useState`.** Add a client store only if truly needed, and ask first.

---

## TypeScript rules

- `strict: true`. No `any`. No `enum` (use `as const` objects or string unions). Use `import type` for types.
- Use Drizzle's inferred types (`typeof table.$inferSelect`); don't duplicate them by hand.
- Values used in more than one file are centralized: role names, movement types, order statuses, API paths, locale and currency codes → `packages/shared`.

---

## How to work on this repo

- Keep each task small and focused. Don't build features that weren't asked for.
- **Don't add a dependency without saying why.** Prefer what's already in the stack.
- Before saying a task is done: run typecheck, lint and tests, and fix what fails.
- Database schema changes always come with a migration. Never use `push` against a shared or production database.
- **After each task, explain:** what you changed, which files, why, and anything I should test or decide.
- Commit messages: `type(scope): description` (e.g. `feat(inventory): add stock adjustment endpoint`).

### Known gotchas

- CSS `@import` doesn't understand TypeScript path aliases; use relative paths in `.css` files.
- Only the root locale layout renders `<html>` and `<body>`; nested layouts never do.
- BullMQ workers don't run inside Next.js; they run in the NestJS app (or a separate worker process).

---

## Pre-commit checklist

- [ ] Typecheck, lint and tests pass
- [ ] Every new query filters by `tenant_id`
- [ ] Every stock change: transaction + `stock_movements` row + row lock
- [ ] Every new endpoint: guards + Zod validation
- [ ] New strings added to `en.json` and `ar.json`
- [ ] Checked in Arabic (RTL) and on mobile
- [ ] Loading / error / empty states present
- [ ] New env variables added to `.env.example`
- [ ] Migration created if the schema changed
- [ ] No `console.log`, no `any`, no secrets
