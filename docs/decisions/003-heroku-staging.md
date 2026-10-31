# Proposed first staging deployment

Status: **proposed for Phase E1**, 30 October 2026; explicit approval pending.
No provisioning, credit activation, billing, public exposure or deployment authorized.

Retain Next.js modular monolith, npm Workspaces, Better Auth, PostgreSQL 16/Drizzle,
tenant membership/context security and Docker development. Propose Heroku Cedar
Common Runtime, classic Node.js buildpack, one Basic web dyno and one same-region
Essential-0 PostgreSQL 16 database. No workers, Redis, production Docker orchestration,
new auth model or automatic public registration.

If approved, this replaces only decision 001's provisional Vercel/managed-database
preview target. Its Next.js architecture and decision 002 remain unchanged.

Existing root build/start and Node 24/npm 11 fit the buildpack. Basic avoids Eco
sleeping for $2/month more, but provides the same 512 MB RAM. Base estimate:
$12/month, conditionally within the advertised $13/month student credit.
Eligibility, optional usage, taxes and actual staging capacity remain unverified.

Heroku's documented Node/Postgres configuration disables certificate verification.
Require a verified trust chain or explicit approval of a staging-only exception;
no global TLS bypass. Ingress/client-IP handling also requires an approved/tested
platform boundary. Do not silently weaken existing security.

After design approval: bounded pool/TLS configuration, advisory-locked runtime
Drizzle release migrations, health checks and guarded private staging-account
bootstrap with tests. Keep Drizzle Kit's local workflow and all CI suites.
Cloud actions require separate approval even after code-only preparation.

See [E1 review](../deployment/heroku.md) for evidence, costs, security gates,
required configuration, recovery plan and unperformed smoke tests.
