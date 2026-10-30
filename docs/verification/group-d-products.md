# Group D Products verification

Verified 29 October 2026 in Docker, on top of
`605ec2042e3303623b462bd8adcccb2abfe31d9d`. No commit, push or deployment was made.

## Automated results

Node 24.22.0 / npm 11.19.1, PostgreSQL 16.15; guarded `makhzan_test` database.
Suites run sequentially because their isolated database setup resets test schemas.

| Check | Result |
| --- | --- |
| TypeScript / ESLint | PASS |
| Unit/Component | 107/107 PASS |
| Database integration | 13/13 PASS |
| Authentication integration | 16/16 PASS |
| Tenancy/RBAC integration | 50/50 PASS |
| Products PostgreSQL integration | 79/79 PASS |
| Real HTTP integration | 58/58 PASS |
| Total | 323/323 PASS |
| Production build | PASS, including with unreachable build-time database |
| Docker development server | PASS, healthy; English/Arabic live HTTP checks |
| Drizzle migration consistency | PASS |
| Compose configuration / actionlint 1.7.12 | PASS |

The existing baseline remains covered; synthetic catalog assertions were changed
only where Group D intentionally replaces the live contract. The fixture service
retains its independent tests. Final source changes were rechecked with Docker
typecheck, lint, unit tests, production build and HTTP tests.

HTTP checks use compiled Next.js production servers on isolated loopback ports,
real PostgreSQL, actual Server Actions and explicit shutdown/cleanup. They cover
authenticated English/Arabic pages, RTL/LTR HTML, CRUD refreshes, empty catalogs,
global queries, tenant isolation, roles, context versions, revocation and safe
errors. Component tests cover forms, current-page UUID selection, stale-context
recovery, feedback after page clamping, and responsive CSS contracts.

The restored Compose development server returned 200 for `/en/sign-in` and
`/ar/sign-in` with the corresponding LTR/RTL HTML root. Anonymous Dashboard and
Products requests in both locales redirected to localized sign-in; the API
returned private/no-store 401. This is live HTTP evidence, not a browser test.
Only the web container was recreated for its added test-config mount; no image
rebuild or volume replacement was needed.

## Security and migration review

- PASS: session, current membership, active tenant and permission checks inside
  transaction locks; all product queries scope tenant ownership.
- PASS: stale mutation/render intent rejection, hostile-origin denial, forged
  owner/tenant/status/timestamp rejection, cross-tenant IDs and role restrictions.
- PASS: private/no-store API responses, safe DTOs/errors and request-scoped render
  context only; no shared tenant or authorization cache.
- PASS: strict normalized inputs, parameterized SQL, literal wildcard searches,
  tenant/SKU uniqueness and concurrent duplicate handling.
- Next.js strips `__proto__` URL keys before Route Handlers. HTTP tests verify
  this cannot bypass authorization/filtering or leak data; raw application parser
  tests reject the key. Wire-level 400 rejection of framework-stripped keys is
  not claimed. Other unknown/repeated/malformed query inputs remain rejected.
- No schema/migration/index changes, dependencies, automatic product seeds or
  inventory operations. Existing UUID defaults, foreign keys, uniqueness and
  PostgreSQL timestamp triggers remain authoritative.
- Development tenants/products/warehouses matched pre-verification content
  hashes. Only the disposable test service was removed; development data and
  named volumes were preserved. No database reset targeted development.
- Credential/artifact review found no exposed credentials, tracked environment
  files other than `.env.example`, generated artifacts or unrelated modifications
  in this change set. Existing Word documents were not changed.
- Full and production audits both retain the four known Moderate findings in
  the Drizzle Kit/esbuild chain; no High/Critical findings. No forced upgrades,
  downgrades or dependency changes were applied.

The 16 real PostgreSQL measurements (1k/10k fixtures) and their limitations are in
[query performance](../performance/products-postgres.md). Synthetic inserts were
rolled back and test fixture preservation passed.

## Browser and CI limitations

Browser automation remains blocked by the documented execution policy. No policy
or security control was bypassed. Desktop/mobile visual layout, focus behavior
and interactive English/Arabic browser scenarios for Group D are **NOT VERIFIED**.
HTTP, jsdom and CSS assertions are not browser evidence. Existing
[Group C manual/browser limitations](group-c-company-selection.md) remain intact.
No scenario-level manual PASS/FAIL results were supplied for this finalization;
no unperformed or unreported check has been relabeled as passed. Multiple-company
and revocation browser scenarios remain NOT VERIFIED as previously documented.

The workflow adds Products integration to all existing checks and passes local
actionlint validation. **Group D GitHub-hosted CI is NOT RUN**: the changes remain
uncommitted/unpushed. Local success is not remote CI success.

Implementation and automated acceptance checks pass. Full visual/browser sign-off
remains outstanding. Same-context concurrent edits are last-writer-wins;
serialization conflicts fail closed and require retry. Deep OFFSET, exact counts
and arbitrary substring search retain the documented scaling limits.

## Changed files (35)

Application, validation and fixtures:

- `apps/web/src/app/[locale]/(dashboard)/products/page.tsx`
- `apps/web/src/app/api/products/route.ts`
- `apps/web/src/components/dashboard/navigation.tsx`
- `apps/web/src/features/products/actions.ts`
- `apps/web/src/features/products/components/product-card.tsx`
- `apps/web/src/features/products/components/product-editor.tsx`
- `apps/web/src/features/products/components/products-table.tsx`
- `apps/web/src/lib/products/catalog.types.ts`
- `apps/web/src/lib/products/product.types.ts`
- `apps/web/src/lib/products/product.validation.ts`
- `apps/web/src/server/products/demo-products.ts`
- `apps/web/src/server/products/product.service.ts`
- `apps/web/src/server/tenants/page-access.ts`
- `apps/web/messages/en.json`
- `apps/web/messages/ar.json`

Tests, benchmark and configuration:

- `apps/web/src/features/products/components/products-table.test.tsx`
- `apps/web/src/lib/products/product.validation.test.ts`
- `apps/web/src/server/products/product.service.test.ts`
- `apps/web/tests/products/products.integration.test.ts`
- `apps/web/tests/http/products.http.test.ts`
- `apps/web/vitest.products.config.mts`
- `apps/web/scripts/benchmark-products-db.mts`
- `apps/web/package.json`
- `package.json`
- `docker-compose.yml`
- `.github/workflows/ci.yml`
- `.env.example`

Documentation:

- `README.md`
- `docs/architecture/authentication.md`
- `docs/architecture/database.md`
- `docs/architecture/tenancy.md`
- `docs/architecture/products.md`
- `docs/deployment/heroku.md`
- `docs/performance/products-postgres.md`
- `docs/verification/group-d-products.md`

Root lockfile, schema, applied migrations, AGENTS instructions and Group C browser
verification record are unchanged.

## Finalization review

All 35 candidate files were reviewed for correctness, tenant-scoped authorization,
server-side query processing, safe errors, unintended changes and credentials.
No blocking code defects or files requiring correction were found. Authentication,
database and tenancy test suites and the centralized permission matrix are
unchanged; their checks remain enabled.

The complete Docker quality sequence was rerun successfully for finalization:
migration consistency, TypeScript, ESLint, all 323 tests, production build with
an unreachable build-time database, and both dependency audits. Candidate file
hashes were unchanged during verification. Only this verification record was then
updated with review/manual-evidence status; no application code was changed.

The exact 35-file inventory above is the staged candidate for:

`feat(products): add tenant-scoped database-backed product management`

No commit or push has been made. Explicit approval and a subsequent real GitHub
Actions run are still required; browser limitations and known Moderate audit
findings remain disclosed.
