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

| Role      | Access                                                        |
| --------- | ------------------------------------------------------------- |
| `OWNER`   | Everything, including billing and users                       |
| `MANAGER` | All inventory operations and reports                          |
| `STAFF`   | Create and receive orders, adjust stock; no settings or users |
| `VIEWER`  | Read only                                                     |

---

## Stack (approved — ask before replacing a chosen technology)

**Architecture decision:** one Next.js App Router **Full Stack** application. No NestJS, no separate API service. Keep a modular monolith: user interfaces and HTTP entry points in `app/`, domain business logic in `server/`, shared validation and types in `lib/` or `packages/shared`.

| Layer                | Technology / rule                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Language             | TypeScript, strict mode                                                                                                  |
| Repository           | npm workspaces; `apps/web` and optional `packages/shared` (add when useful)                                              |
| Frontend and backend | Next.js App Router; Server Components, Server Actions, and Route Handlers                                                |
| Database             | PostgreSQL 16 + Drizzle ORM; migrations via drizzle-kit                                                                  |
| Auth                 | Better Auth (validate sessions server-side)                                                                              |
| Validation           | Zod, shared by server and client where applicable                                                                        |
| UI                   | Tailwind CSS, shadcn/ui, lucide-react                                                                                    |
| Client server-state  | TanStack Query **only if** interactive client-side fetching/caching needs it; prefer Server Components for initial reads |
| Tables / charts      | TanStack Table / Recharts as features require                                                                            |
| Internationalization | next-intl; English default, Arabic full RTL                                                                              |
| Files                | Cloudflare R2 (when uploads are implemented)                                                                             |
| Testing              | Vitest for unit/integration; HTTP Route Handler integration tests; Playwright for essential browser E2E when needed      |
| Local database       | Docker Compose for PostgreSQL; Redis is **optional/deferred**                                                            |
| Hosting target       | Heroku student credits (provisional); verify deployment compatibility, costs, and plan limits before activation          |
| Package manager      | npm only — no pnpm, no yarn                                                                                              |

### Architecture rules

- **Server Components** may read authorized data through server-only services. **Server Actions** handle suitable UI mutations. **Route Handlers** expose HTTP APIs where needed (external integrations, webhooks, explicit client HTTP APIs, or status checks). Do not create a Route Handler merely so a Server Component can call the same server.
- All mutations funnel through server-side **domain services**. Never place inventory transaction logic in UI components, and do not duplicate business rules across Server Actions and Route Handlers.
- Validate and authorize inside every server entry point/service; middleware or hidden UI controls do not constitute authorization.
- Mark sensitive server modules `server-only` where appropriate. Keep DB credentials, auth secrets and private storage credentials off the client; only `NEXT_PUBLIC_` variables are intended for client exposure.
- Do not assume an in-memory variable, process lock, or Next.js runtime state is shared across requests/instances; PostgreSQL is the durable source of truth.
- **No always-on BullMQ worker inside a Vercel request runtime.** Queue/worker requirements are deferred until a concrete feature needs them; choose a compatible separate managed worker or durable scheduled/background architecture by ADR before adding it.
- Free-tier deployment is for a limited-access portfolio demonstration, not a guarantee of always-on behavior or readiness to host customer business data.

### Avoid unless approved

NestJS, Prisma, TypeORM, Mongoose/MongoDB, Socket.io, Redux/MobX/Jotai, Moment.js (prefer `date-fns`), MUI/Ant/Chakra, styled-components/Emotion/CSS Modules, Axios (prefer native `fetch` where HTTP is actually necessary). Do not add Redis/BullMQ by default.

---

## Repo structure

```text
makhzan/
├── AGENTS.md
├── README.md
├── docker-compose.yml      # local PostgreSQL; Redis only if later justified
├── package.json            # npm workspaces root
├── .env.example
├── apps/
│   └── web/                # single Next.js full-stack application
│       ├── messages/       # en.json, ar.json
│       └── src/
│           ├── app/[locale]/  # pages, layouts, Server Components/Actions
│           ├── app/api/       # Route Handlers where HTTP APIs are needed
│           ├── components/    # presentational / client UI
│           ├── server/        # server-only domains: auth, tenants, products,
│           │                  # inventory, purchase-orders, sales-orders, etc.
│           ├── db/            # schema, client, migrations
│           ├── i18n/
│           └── lib/           # shared schemas, constants and utilities
└── packages/
    └── shared/             # OPTIONAL: add if sharing across packages is useful
```

Use domain-oriented service modules (e.g. `server/inventory/`). Keep entry points thin; all critical domain logic lives in services. Do not create unused directories just to satisfy the diagram.

---

## Inventory rules (the core of this app — highest priority)

1. **Every stock change runs inside one database transaction** (`db.transaction(...)`).
2. **Every stock change writes a row to `stock_movements`.** The ledger is append-only: never update or delete movement rows. Corrections are new movements.
3. **Stock levels are never edited directly.** `stock_levels` (tenant, product, warehouse → quantity) is only changed in the same transaction that inserts the movement.
4. **Lock before you change.** Read the `stock_levels` row with `SELECT ... FOR UPDATE` inside the transaction, so two simultaneous sales can't both take the last unit.
5. **No negative stock** unless the tenant setting `allowNegativeStock` is on. Otherwise reject with a clear error.
6. **Movement types** live in a central shared constants module (e.g. `src/lib/constants`) as `as const`:
   `PURCHASE_RECEIPT`, `SALE`, `ADJUSTMENT_IN`, `ADJUSTMENT_OUT`, `TRANSFER_IN`, `TRANSFER_OUT`, `RETURN_IN`, `RETURN_OUT`.
7. **Each movement records:** tenant, product, warehouse, type, quantity (signed), resulting balance, reference (e.g. PO or SO id), user, timestamp, optional note.
8. **Every stock-changing operation requires an idempotency identifier.** For HTTP Route Handlers accept an `Idempotency-Key` header; for Server Actions pass an equivalent stable operation identifier, generated per user intent and reused on retry. Enforce uniqueness, request fingerprint consistency and atomic persistence server-side. A retried request must not move stock twice.
9. **Orders follow a state machine.** Purchase order: `DRAFT → ORDERED → PARTIALLY_RECEIVED → RECEIVED`, or `CANCELLED`. Sales order: `DRAFT → CONFIRMED → FULFILLED`, or `CANCELLED`. Invalid transitions are rejected in the server-side domain service, not only hidden in the UI.

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

- Better Auth sessions via secure, httpOnly cookies; configure cross-site and production cookie settings deliberately.
- At each protected Server Action, Route Handler, or server-side operation, verify **authentication**, current tenant membership, and **authorization (RBAC)**. Do not rely on middleware alone.
- `tenant_id` is resolved from the authenticated user's validated tenant context; do not trust `tenant_id` supplied by client input. Ownership checks apply to related resource IDs as well.
- Validate all untrusted input with Zod on the server, including body/query/params and Server Action arguments.
- Protect against CSRF appropriate to the chosen auth/mutation mechanism; do not assume custom API endpoints are automatically safe.
- When implemented, upload directly to R2 with short-lived presigned URLs, restrict file type/size and verify access to stored files; do not proxy large files through serverless request functions.
- Never log secrets, tokens or complete sensitive bodies. Never commit `.env`; document each new variable in `.env.example`.

---

## Background work (deferred until a real use case)

- First release does not require Redis/BullMQ. Avoid starting always-on consumers inside Next.js routes or Server Actions.
- Later AI invoice extraction, emails or exports may need durable asynchronous execution; write an ADR covering queue provider, worker hosting, timeouts, retries, idempotency and cost before implementing.
- Jobs must be safe to retry, use bounded backoff and log failures with a job ID.

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
- Locale root layout sets `<html lang={locale} dir={locale === 'ar' ? 'rtl' : 'ltr'}>` and uses Radix `DirectionProvider` where relevant.
- **Logical properties only:**
  - `ms-*` / `me-*`, never `ml-*` / `mr-*`
  - `ps-*` / `pe-*`, never `pl-*` / `pr-*`
  - `start-*` / `end-*`, never `left-*` / `right-*`
  - `text-start` / `text-end`, never `text-left` / `text-right`
  - `border-s` / `border-e`, `rounded-s-*` / `rounded-e-*`
- Never use `flex-row-reverse` to fix RTL; plain `flex` already flips.
- Content that must stay LTR (SKUs, barcodes, phone numbers, emails, order numbers) uses the `.text-ltr` utility:
  ```css
  .text-ltr {
    direction: ltr;
    unicode-bidi: embed;
    text-align: start;
  }
  ```
- Fonts: a Latin font and an Arabic font loaded with `next/font`, switched by `[lang="ar"]` through a CSS variable. Never hardcode font-family in components.
- Directional icons (chevrons, arrows) flip in RTL.

---

## UI rules

| Area                                                    | Freedom                                                              |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| Landing / marketing page, onboarding, empty states, 404 | **High** — bold layouts, custom gradients, GSAP or staged animations |
| Dashboard overview, KPI cards, charts                   | **Balanced** — design tokens for UI, some freedom on hero cards      |
| Tables, forms, settings, modals                         | **Strict** — tokens only, predictable patterns, speed over style     |

- Functional colors (text, buttons, inputs, borders, states) use CSS variable tokens. Decorative colors may be hardcoded.
- Every data component handles **loading** (skeleton), **error** (message + retry) and **empty** (message + call to action).
- Tables: server-side pagination, sorting and filtering; card layout on mobile.
- Always respect `prefers-reduced-motion`. Never animate while the user types.
- Accessibility: keyboard navigation, labels on every field, visible focus rings, 4.5:1 contrast, 44px touch targets.
- All hooks before any early return.

---

## State management

- Prefer React Server Components and server-side data access for initial reads. Avoid HTTP calls from Server Components to your own Route Handlers without a reason.
- Use TanStack Query **only for interactive client-side server-state needs** such as polling and client caching; do not mirror its data into another state store.
- Local UI state uses `useState`; add a global client store only with justification and approval.

---

## TypeScript rules

- `strict: true`. No `any`. No `enum` (use `as const` objects or string unions). Use `import type` for types.
- Use Drizzle's inferred types (`typeof table.$inferSelect`); don't duplicate them by hand.
- Values used in more than one file are centralized: role names, movement types, order statuses, locale and currency codes → one shared module; extract `packages/shared` only when multiple packages need it.

---

## How to work on this repo

- Keep each task small and focused. Don't build features that weren't asked for.
- **Don't add a dependency without saying why.** Prefer what's already in the stack.
- Before saying a task is done: run typecheck, lint and tests, and fix what fails.
- Database schema changes always come with a migration. Never use `push` against a shared or production database.
- **After each task, explain:** what you changed, which files, why, and anything I should test or decide.
- Commit messages: `type(scope): description` (e.g. `feat(inventory): add stock adjustment`).

### Known gotchas

- CSS `@import` doesn't understand TypeScript path aliases; use relative paths in `.css` files.
- Only the root locale layout renders `<html>` and `<body>`; nested layouts never do.
- If a persistent queue is added later, its worker must use a compatible separate worker execution environment, not a Next.js request handler.

---

## Pre-commit checklist

- [ ] Typecheck, lint and tests pass
- [ ] Every new query filters by `tenant_id`
- [ ] Every stock change: transaction + `stock_movements` row + row lock
- [ ] Every new protected Server Action/Route Handler: server-side auth + tenant/RBAC checks + Zod validation
- [ ] New strings added to `en.json` and `ar.json`
- [ ] Checked in Arabic (RTL) and on mobile
- [ ] Loading / error / empty states present
- [ ] New env variables added to `.env.example`
- [ ] Migration created if the schema changed
- [ ] No `console.log`, no `any`, no secrets
