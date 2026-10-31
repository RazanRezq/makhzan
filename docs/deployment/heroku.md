# Heroku staging — Phase E1 review

Reviewed 30 October 2026. **Proposal only; no cloud resources or account changes.**
Runtime/security configuration below is not implemented or approved by this review.

Baseline `4ed07074f6b88bce43f93434873b9ed7a87c6e1a` passed all 323 tests and
[real GitHub CI](https://github.com/RazanRezq/makhzan/actions/runs/41053612922).
Database Products, authentication and tenancy already exist; the former
synthetic-only deployment description is obsolete. See the
[proposed staging decision](../decisions/003-heroku-staging.md).

## Recommended architecture and cost

One Cedar Common Runtime app, official classic Node.js buildpack, one **Basic web
dyno**, and a separate same-region **Essential-0 PostgreSQL 16** database. Confirm
region/plan/version availability before provisioning; EU is proposed, not selected.
No Redis, workers, scheduler, paid monitoring or production Docker orchestration.

| Option | Web/month | PostgreSQL/month | Base/month | Web RAM / behavior |
| --- | ---: | ---: | ---: | --- |
| Eco + Essential-0 | $5 shared 1,000-hour pool | $5 | $10 | 512 MB; sleeps after 30 idle minutes |
| Basic + Essential-0 — recommended | $7 | $5 | $12 | 512 MB; no Eco idle sleep |

USD prices checked 30 October 2026 against [Heroku pricing](https://www.heroku.com/pricing/).
Basic's $2 increment avoids idle sleep, not memory limits or outages. Neither tier
is a customer-data/high-availability commitment. Heroku runtime memory/load and
startup capacity are NOT VERIFIED; 512 MB suitability remains an assumption.
Measure production RSS, concurrent sign-ins/Products use, startup and router errors
before approval to operate. Build memory is separate from web-runtime memory.

The [student offer](https://www.heroku.com/students/) advertises $13/month for 24
months ($312 total), not a spendable $312 lump sum. Unused monthly credits expire.
If the full credit is active/available and no other usage consumes it, either base
configuration fits; Basic leaves only $1 headroom. No credit/billing eligibility
or balances were inspected or activated here.

Release/one-off dynos, extra apps/databases, upgrades and overlapping restore
resources can add charges. Taxes and third-party add-ons must be checked separately;
student credits do not cover third-party add-ons. Expired/ineligible credits leave
the full $10/$12 base payable. These are estimates, not spending caps. Stopping web
does not stop database billing. Do not add unused Redis to consume credits.

Essential-0 has 1 GB storage/20 connections and shared resources. Maintenance,
automatic PostgreSQL upgrades, lack of separate credentials and lack of database
logs limit its suitability. Use synthetic portfolio data only.

## Repository/build compatibility

- Root `package.json` and `package-lock.json` are authoritative. Deploy the repository
  root, not `apps/web` in isolation. Existing npm Workspaces build/start scripts
  already delegate correctly; no dependency changes or custom server are needed.
- Heroku supports Node `24.x` / npm `11.x`. Docker/CI use Node 24.22.0. Record the
  actual Heroku patch in release evidence; retain supported security updates.
- The [classic buildpack](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds)
  uses `npm ci`, installs build tools, runs the root build, then prunes devDependencies.
  Do not install production-only packages before compiling Next.js.
- `npm run build` / `npm run start` use Next.js production mode and support the full
  application. Next reads platform `PORT`; never set a fixed Heroku port. Verify
  `0.0.0.0` binding, graceful shutdown and router-compatible keep-alive.
- Current Dockerfile is development-only (includes tools and `next dev`). Preserve
  Docker development/volumes; a production image adds unneeded maintenance here.
- Do not migrate, seed accounts or require a reachable DB during the build.
  Existing production builds work with a syntactically valid but unreachable DB.
  Build config vars are server-only; never expose secrets through `NEXT_PUBLIC_`.
- Approve/release an exact CI-passing SHA. Do not enable automatic public deployment
  from every push or inject hosting credentials into GitHub Actions yet.

## Configuration still required

These are proposed changes, not deployed controls:

1. Explicit startup validation with a proposed `APP_ENV=staging` guard; exact HTTPS
   origins, strong unique auth secret, correct database target, no test flags.
2. Shared runtime/migration/readiness TLS/pool configuration: propose 5 app
   connections, bounded acquisition/query waits, redacted idle-client errors.
   Reserve capacity for release/admin and old/new processes within 20 connections.
3. A release-only script using installed runtime `pg`/Drizzle and a two-process
   `Procfile` (web/release). Current `db:migrate` uses dev-only `drizzle-kit`, which
   will be pruned. Preserve that local workflow; do not retain all dev dependencies
   or move/upgrade packages to avoid implementing a runtime migration runner.
4. Minimal read-only liveness and bounded DB readiness (200/503, no schema,
   credentials or stack traces), with safe outage behavior. No public debug route.
5. Approved ingress/IP normalization and HTTPS/cookie checks across auth and company
   creation rate limits. No global forwarded-header trust or wildcard proxies.
6. Operator-only account bootstrap and release/start/health/security regression
   tests, without removing any existing CI suite or audit gate.

### TLS approval gate

Current database setup checks URL syntax but does not explicitly require TLS or
bound connection acquisition. [Heroku's Node/Postgres example](https://devcenter.heroku.com/articles/connecting-heroku-postgres)
uses `rejectUnauthorized: false` or `PGSSLMODE=no-verify`. That encrypts traffic but
does not verify server identity: it is not equivalent to verified TLS. Installed
`pg-connection-string` has distinct SSL-mode semantics; do not assume
`sslmode=require` silently resolves trust.

Prefer verified TLS with a supported trust chain, if available. Otherwise require
explicit approval for a narrowly scoped staging-only certificate-verification
exception, or approval to reconsider the database provider. No such exception is
implemented. Never disable TLS globally, set `NODE_TLS_REJECT_UNAUTHORIZED=0`,
fall back to plaintext, or silently select `no-verify`.

### Auth, ingress and private staging access

Required config vars: `NODE_ENV=production`, unique high-entropy
`BETTER_AUTH_SECRET` (at least 32 characters), exact HTTPS `BETTER_AUTH_URL`,
matching `AUTH_TRUSTED_ORIGINS`, and the separate staging add-on's `DATABASE_URL`.
Document proposed staging/TLS/pool variables in `.env.example` when implemented.
Unset `AUTH_TEST_MODE`, `TEST_DATABASE_URL`, test build-directory overrides and
development watcher settings. Never copy local users, sessions, products or secrets.

Better Auth already provides database sessions, HTTPS Secure/HttpOnly cookies,
origin/CSRF checks, safe redirects and database rate limits. Production email
registration stays disabled; never enable test mode/public signup to bootstrap.
Membership, RBAC and context-version checks remain server-enforced. Products API
is authenticated/tenant-scoped; the obsolete demo flag provides no public path.

[Heroku preserves/appends forwarded IP chains](https://devcenter.heroku.com/articles/http-routing);
client-supplied prefixes are not trusted identities. Installed Better Auth rejects
ambiguous chains without proxy trust and falls back to a shared per-path limiter
when no IP resolves. Local limiter tests do not establish deployed ingress trust.
Approve a platform-specific trust boundary and test forged, missing, malformed and
IPv6 chains before exposure. Do not claim the current defaults are Heroku-verified.

Initial accounts: reviewed private one-off operator script, restricted to the named
staging app/database and explicit confirmation. Validate the profile, use Better
Auth's supported password-hash helper and atomically insert identity/credential
rows. Secure interactive password input only: no command-line password, URL,
history, log or committed fixture. No HTTP bootstrap endpoint or auth plugin.
The operator then uses normal sign-in and atomic company onboarding. Additional
role/isolation fixtures require an explicit synthetic-fixture operation, not
automatic startup/migration seeding. This tooling still needs implementation/tests.

## Migrations, backups and recovery

- Only after approval: provision a separate empty PostgreSQL 16 database; explicitly
  request version 16 rather than assuming the provider default. Apply existing
  `0000`–`0004` migrations unchanged. No `drizzle-kit push`, schema reset or local import.
- Runtime release runner: one checked-out client; advisory lock acquired **before**
  reading migration history; journal/hash verification; bounded lock wait;
  transactional Drizzle migration; repeat-safe pending-only application; reliable
  nonzero failure exit. Test clean/upgrade/concurrent/repeated and injected failures.
- Ensure migration files and runtime imports survive package pruning. A failed
  release must not start new code. Config/add-on changes have release-phase caveats:
  resolve failed migrations before other releases. Do not assume every change
  reruns migration hooks. See [release phase](https://devcenter.heroku.com/articles/release-phase).
- Schedule daily [PGBackups](https://devcenter.heroku.com/articles/heroku-postgres-backups)
  and verify a completed capture before schema changes. Essential retains five
  manual backups; confirm scheduled retention. Proposed demo backup RPO: up to
  24 hours; recovery time is unmeasured, not promised.
- Restore only after operator approval to a **separate, explicitly identified**
  database. Validate schema, auth and isolation before switching attachment.
  Restores overwrite targets and temporary databases can cost money. Never restore
  over local development. Protect encrypted exports and signed backup links.
- Application rollback selects a known-good release, not a database rewind.
  Preserve schema compatibility; no automatic destructive down-migrations.

## Lightweight operations and acceptance

Use platform app/router/release logs and safe request IDs/error codes. No tokens,
cookies, passwords, complete bodies, sensitive query text or connection URLs.
Review router query logging before real data. No paid log drain/APM is proposed;
check retention before assuming historical logs are durable.

Check readiness, crashes, memory/router errors, DB connections/storage, backups
and account credit/usage daily and before/after releases. Dyno filesystems are
ephemeral: PostgreSQL is durable business/session storage, not local files.
Uploads/R2, Redis, queues and background workers remain deferred.

Every row below is **NOT VERIFIED on Heroku**; local tests are not cloud/browser proof.

| Staging smoke scenario | Required evidence after approval |
| --- | --- |
| Startup/health/HTTPS | Correct PORT, bounded readiness, HTTPS behavior, no secret/debug output |
| English/Arabic | Localized sign-in, Dashboard and Products; actual browser LTR/RTL/mobile checks |
| Identity/session | Signup blocked; sign-in, secure cookie attributes, logout/revocation, CSRF/redirect rejection |
| Company context | Onboarding, sole/multiple-company entry, invalid/revoked context, stale-tab rejection |
| Products | Empty catalog; create/edit/archive/reactivate/refresh; global search/filter/sort/pagination |
| RBAC/isolation | OWNER/MANAGER writes, STAFF/VIEWER rejection, tenant A cannot read/change tenant B through IDs/actions/cache |
| Rate limiting | Forged/missing/IPv6 ingress tests without a public diagnostics endpoint |
| Restart persistence | Approved synthetic product survives web restart; no local-file dependency |
| Failure/recovery | Safe DB outage/readiness 503; migration failure prevents release; isolated restore/rollback drill |

Existing [browser limitations](../verification/group-c-company-selection.md) and
[four Moderate findings](../../README.md#dependency-security) remain disclosed.
No new cloud or browser PASS is claimed.

### Local E1 verification

Fresh Docker verification on 30 October passed migration consistency, TypeScript,
ESLint, production build and 323/323 tests: 107 Unit/Component, 13 Database,
16 Authentication, 50 Tenancy/RBAC, 79 Products and 58 real HTTP tests. Build also
passed with an unreachable build-time database. Full/production audits retained
four Moderate findings and no High/Critical findings; no forced fixes were used.
An additional root-start/nondefault-PORT smoke launch was blocked by execution
policy and remains NOT VERIFIED. No alternate launch was attempted to bypass it.

Only this guide and the proposed ADR changed. Application code, dependencies,
root lockfile, migrations, Docker/CI and local environment settings are unchanged.
Development business-record hashes matched before/after verification; no local
database/volume reset was performed. The disposable test database alone was reset
by guarded suites. No Heroku account, resources or credentials were accessed.

## Approval gate

Approve the architecture, region and $12 base budget/billing exposure, TLS trust
approach and ingress/private-bootstrap design before runtime implementation.
Separately authorize credit activation, app/database provisioning, secret setup,
account creation, deployment/public exposure, restart/restore drills and paid
recovery resources. No automatic commit/push. Stop before these actions.

## Official references checked

[Runtime support](https://devcenter.heroku.com/articles/nodejs-support),
[buildpack](https://devcenter.heroku.com/articles/nodejs-classic-buildpack-builds),
[plans](https://devcenter.heroku.com/articles/heroku-postgres-plans),
[version selection](https://devcenter.heroku.com/articles/provisioning-heroku-postgres),
[connection setup](https://devcenter.heroku.com/articles/connecting-heroku-postgres),
[pricing](https://www.heroku.com/pricing/), [credits](https://www.heroku.com/students/),
[credit limits](https://help.heroku.com/FFN35ZM2/why-am-i-being-charged-for-heroku-services-even-though-i-m-in-the-github-student-program),
[routing](https://devcenter.heroku.com/articles/http-routing),
[release phase](https://devcenter.heroku.com/articles/release-phase),
[backups](https://devcenter.heroku.com/articles/heroku-postgres-backups).
