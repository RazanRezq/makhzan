# Heroku deployment readiness

**Status:** Reviewed 20 October 2026; not deployed and no resources provisioned.

## Current application contract

- The repository root contains `package.json` and the authoritative
  `package-lock.json`. Heroku's Node buildpack can detect the app, install with
  npm, and run the root `build` script.
- Root `engines` selects supported Node `24.x` and npm `11.x`. Docker and CI use
  the exact Node 24.22.0 version from `.nvmrc`; Heroku may select a newer
  supported Node 24 security patch.
- The root `start` script delegates to `apps/web` and runs `next start`. Next.js
  reads Heroku's assigned `PORT`; no Procfile is required because a root start
  script exists.
- `NODE_ENV` must remain `production`. Group D replaces the demo Products API
  with an authenticated, tenant-scoped read-only endpoint; the old demo flag is
  obsolete. Localized Products pages read services directly, not that API.
- PostgreSQL and server-only database/auth configuration are required for the
  current application. Credentials belong in Heroku config vars, never committed
  files or build arguments. Redis/workers and uploads remain deferred.

## Platform constraints and cost

- Dyno filesystems are ephemeral and not shared. Runtime writes cannot be a
  durable store. Future uploads must use the planned direct-to-R2 flow.
- Eco currently costs $5/month for a shared pool and sleeps after 30 minutes of
  inactivity; Basic currently costs $7/month and is always on. Both list 0.5 GB
  RAM. Recheck pricing and limits immediately before activation.
- The current GitHub Student offer is $13/month for 24 months, with no rollover.
  It can cover a small demo combination such as Eco plus a Mini Heroku Postgres
  database when database work begins, but charges above the monthly credit remain
  payable. Credits and billing eligibility must be confirmed in the account.
- The target is a limited-access portfolio demonstration. Sleeping, cold starts,
  shared-compute variability, and the absence of customer-data controls make it
  unsuitable for production tenant data.

## Requirements before the first deployment

1. Commit and push Groups C and D, then require a successful GitHub-hosted CI
   run. Local workflow validation is not equivalent to a hosted run.
2. Confirm student-credit activation, billing exposure, region, dyno tier, and
   current pricing. Do not activate resources implicitly.
3. Create the Heroku app with the official Node.js buildpack and deploy from the
   repository root so npm Workspaces and the root lockfile are preserved.
4. Review config vars and keep the demo Products API disabled unless its public
   exposure is intentional. Do not override `NODE_ENV` or Heroku's `PORT`.
5. Verify build logs, startup, `/en/products`, `/ar/products`, RTL output, and the
   production-disabled API contract after deployment. Add availability and cost
   monitoring appropriate to the selected tier.
6. Before persistent business data is introduced, provision managed PostgreSQL,
   implement controlled migrations/backups/authentication, and complete the
   tenant/security test plan. This is a future sprint, not part of this review.
7. Before asynchronous invoice extraction or other jobs, approve an ADR for a
   separate durable worker/queue runtime. Do not run an always-on worker inside
   the Next.js web process.

## Current blockers

- No real GitHub Actions run has executed for this workflow yet.
- No Heroku application, credits, billing configuration, domain, or config vars
  have been created or validated.
- Database, authentication, durable uploads, backups, and worker architecture are
  intentionally not implemented; the app is demo-ready, not customer-ready.

## Official references

- [Heroku Node.js support](https://devcenter.heroku.com/articles/nodejs-support)
- [Heroku Node.js behavior](https://devcenter.heroku.com/articles/nodejs-behavior-in-heroku)
- [Heroku dyno isolation and ephemeral filesystems](https://devcenter.heroku.com/articles/dyno-isolation)
- [Heroku pricing](https://www.heroku.com/pricing)
- [Heroku for GitHub Students](https://www.heroku.com/students/)
