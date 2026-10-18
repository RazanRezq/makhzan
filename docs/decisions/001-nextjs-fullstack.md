# Makhzan — Architecture Decision (Next.js Full Stack)

**Status:** Approved direction; implementation has **not** started.  
**Decision:** Build one Next.js App Router application (`apps/web`) with server-side domain modules and PostgreSQL. Do not create `apps/api` or install NestJS.

## 1. Why this architecture?

- Portfolio goal: learn frontend, backend, SQL, security, testing and deployment while reaching a live demo early.
- Less deployment overhead than managing two applications.
- Next.js is **not just a frontend**: Server Components, Server Actions, and Route Handlers run server-side.
- Architectural boundaries still matter. One deployed application can be a **modular monolith**.
- Trade-off: less direct experience designing and deploying a *separate* NestJS API service; explicit HTTP APIs can still be learned via Route Handlers.

## 2. Request paths

**Initial read**: Browser → Next.js Server Component → authorized domain service → Drizzle → PostgreSQL → rendered UI.

**UI mutation**: Browser form → Server Action → Zod validation → session/tenant/RBAC checks → domain service → PostgreSQL transaction → refreshed UI.

**External API** (when needed): HTTP client → `app/api/.../route.ts` → validate/authenticate/authorize → same domain service → response.

A successful client response is not required for a committed database transaction to remain saved. For critical stock operations, use idempotency keys and an explicit status/recovery strategy.

## 3. Data correctness does not change

- One transaction for each stock change; movement ledger is append-only.
- Row locking / concurrency strategy applies to PostgreSQL, not JavaScript memory.
- No duplicate side effects on retry; keys must distinguish retries from new operations.
- Tenant context is verified server-side and every business-data access is tenant scoped.
- Keep order state transitions enforced in domain services.

## 4. Runtime and deployment

**Local:** one Next.js development server + PostgreSQL using existing Docker Compose after reviewing its config. Docker Compose may still mention Redis; do not assume Redis is required for the first release.  
**Preview target:** Vercel (Next.js) + a managed PostgreSQL free tier (e.g., Neon), subject to current plan conditions and availability.  
**Not in the initial deployment:** continuously running Redis/BullMQ workers, AI extraction pipelines, or commercial tenant data. If background processing becomes necessary, write an ADR and pick an appropriate worker/runtime.

Deployment checklist: secrets in hosting settings; no client exposure; migrations from a controlled process; auth redirect/cookie configuration; tests; basic logs; backup/recovery policy; verify free-tier limitations. Platform choice can be reconsidered before deployment.

## 5. Minimal folder structure

```text
makhzan/
├── AGENTS.md                  # replace with approved updated version
├── package.json               # npm workspaces root (already being configured)
├── docker-compose.yml
└── apps/
    └── web/
        └── src/
            ├── app/          # layouts, pages, Server Actions, Route Handlers
            ├── components/   # UI
            ├── server/       # auth, tenants, products, inventory etc.
            ├── db/           # Drizzle schema/client/migrations
            └── lib/          # shared schemas/constants/helpers
```

No separate `packages/shared` workspace is necessary until it provides clear value. Existing root `workspaces: ["apps/*", "packages/*"]` can remain; an empty `packages/` is acceptable.

## 6. Next steps / checkpoints

1. **Documentation:** approve and copy `AGENTS_NextJS_FullStack.md` to your repository as `AGENTS.md` (back up old content in Git). Add this architecture decision to `docs/decisions/` when ready.
2. **Root setup:** verify existing root `package.json` defines npm workspaces; do not recreate it.
3. **Scaffold:** initialize Next.js with TypeScript, App Router, `src/`, Tailwind and npm in `apps/web` while preserving the root workspace configuration. Verify the generated lockfiles and unify npm installs at the root.
4. **First vertical slice:** start the app locally, understand Server Component vs Client Component vs Server Action vs Route Handler; render a simple page. Then create a tiny `GET /api/health` for HTTP learning.
5. **Tests and preview:** add appropriate tests / CI and deploy a limited-access synthetic-data preview early. Do not expose stock-changing endpoints before auth, tenant checks, transactions and idempotency are tested.

## 7. Learning questions

- What is executed on the server versus sent to the browser?
- Why must a Server Action verify authorization even if the button is hidden?
- When is a Route Handler necessary, and when is a Server Component/service call simpler?
- How does one Next.js app still keep inventory rules outside its UI?
- Why can two simultaneous requests still corrupt stock without PostgreSQL-level controls?

## 8. Decisions deferred

Exact hosting provider and free-plan limits; whether a separate background worker is needed; when client-side TanStack Query adds value; whether additional reusable packages are justified; payment and AI workflows. Record evidence before adding infrastructure.
