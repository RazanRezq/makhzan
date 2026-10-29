# Group C and company selection UX verification

Verification record: 29 October 2026 (Europe/Istanbul).

Scope: existing Group C tenant memberships/RBAC plus the pending company-selection
UX changes on top of `b7c69cdda9b2ba060fca1b482fd626c73d679ab1`. No Group D,
Products CRUD, additional dependencies, or new migrations are included.

## Automated verification

Docker uses Node.js 24.22.0 / npm 11.19.1 and an isolated PostgreSQL 16 test service.
The final Docker-first verification run passed all 170 automated tests.

| Check | Result |
| --- | --- |
| TypeScript | PASS |
| ESLint | PASS |
| Unit/Component | 62/62 PASS |
| Database integration | 13/13 PASS |
| Authentication integration | 16/16 PASS |
| Tenancy/RBAC integration | 50/50 PASS |
| Real HTTP integration | 29/29 PASS |
| Production build | PASS (also verified without a reachable build-time database) |
| Drizzle migration consistency | PASS |

The tenancy suite retains clean-migration/Group B upgrade preservation checks,
concurrent onboarding, OWNER protection, role changes/revocation, forged selectors,
cross-tenant isolation, and stale-context checks. Single-company entry is tested
for authenticated POST-only selection, no role elevation, no arbitrary selection
with multiple memberships, and unchanged contexts on repeated entry/refresh.
HTTP tests exercise actual compiled Next.js Server Actions and English/Arabic
routes. Component tests cover switcher keyboard interaction and focus return.
Neither HTTP nor jsdom component tests are a substitute for browser verification.

## Browser verification: evidence and limitations

Browser automation is BLOCKED by execution policy. The attempted isolated browser
test-server launch returned `blocked by policy`; no supported browser tool is
exposed in this session. Local policy checks did not identify the enforcing rule.
No policies, launch restrictions, security checks, or production auth settings
were weakened or bypassed. No automated browser PASS is claimed for this UX.

The user reports having performed the available manual checks, but has not yet
provided scenario-level PASS/FAIL results. The entries below remain NOT VERIFIED
without those results; none are assumed passes. Any supplied manual result will be attributed to the user,
not described as an agent-observed browser test.

Base URL: `http://localhost:3000`.

| Manual scenario | Routes / scope | Reported result |
| --- | --- | --- |
| Sole eligible company opens Dashboard without a chooser | `/en/sign-in` → `/en` | NOT VERIFIED — user result not supplied |
| New account without membership reaches onboarding | `/en/sign-in` → `/en/onboarding` | NOT VERIFIED — user result not supplied |
| Valid selection persists on refresh/navigation | `/en`, `/en/products` | NOT VERIFIED — user result not supplied |
| Desktop/mobile layout and single-company header | Dashboard at desktop/mobile widths | NOT VERIFIED — user result not supplied |
| English LTR / Arabic RTL | Corresponding `/en/*` and `/ar/*` routes | NOT VERIFIED — user result not supplied |
| Logout and fresh login follow the selection policy | Localized sign-in and Dashboard | NOT VERIFIED — user result not supplied |
| No redirect loops, chooser flicker, or navigation errors | Available-account navigation | NOT VERIFIED — user result not supplied |
| Multiple-company selection and actual switching, desktop/mobile | `/en/select-company`, `/ar/select-company`, Header | NOT VERIFIED — not manually performed |
| Revoked/inactive company recovery without silent fallback | Protected pages and selection/onboarding recovery | NOT VERIFIED — not manually performed |

Multiple-company and revocation browser scenarios remain unverified even if other
manual checks pass. Their real PostgreSQL, HTTP, and component coverage remains
enabled; this limitation must not be relabeled as browser success. The development
fixture inspection found only one account with one active company, so it could not
exercise those scenarios through the available UI.

## Migration and working-tree review

Group C migrations `0003_regular_thunderbolts.sql` and
`0004_tenant-context-triggers.sql` are already committed. They add the tenancy tables,
constraints/indexes and timestamp/context-version triggers without rewriting
existing business records. The UX introduces no schema changes. Applied migrations
must not be edited; reversal requires a reviewed backup/recovery plan, not volume
resets or destructive down migrations. See [tenant architecture](../architecture/tenancy.md).

Development tenants/products/warehouses matched their pre-verification content
hashes after the test/build run. Only the guarded ephemeral test database was
reset/removed; development volumes were preserved. The final diff review and
credential/artifact scan found no secrets or unintended files in the 23-file
candidate scope. Root lockfile, dependency manifests, schema, existing migrations,
Docker configuration, workflow and AGENTS instructions are unchanged by the UX.

Both full and production dependency audits retain four Moderate entries in the
Drizzle Kit / `@esbuild-kit/esm-loader` / `@esbuild-kit/core-utils` / nested esbuild
chain, associated with [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99).
No High/Critical findings were reported. No forced fixes, dependency upgrades, or
breaking downgrades were applied. Do not interpret this as a zero-findings audit.

## GitHub Actions and approval

The already-committed Group C foundation passed its
[GitHub-hosted CI run](https://github.com/RazanRezq/makhzan/actions/runs/40874375798).
That run does not verify the pending UX changes. The existing workflow includes
all five automated suites, TypeScript, ESLint, migration checks, audit, and build.

No commit or push is authorized until the proposed contents are reviewed and the
user explicitly approves. GitHub-hosted CI for the proposed UX finalization commit
is PENDING; report its actual result and run URL only after an approved push.
