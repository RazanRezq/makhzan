# Authentication architecture

**Scope:** Sprint 02 Group B. User identity only. Tenant membership, RBAC,
organization management, tenant switching, and business-data authorization are
deferred.

## Runtime

- Better Auth 1.7 uses its official Next.js handler at `/api/auth/[...all]` and
  the official Drizzle PostgreSQL adapter.
- Email/password credentials use Better Auth's password hashing. Passwords are
  never stored or logged in plaintext.
- Sessions are stored in PostgreSQL. The opaque session cookie is HttpOnly,
  SameSite Lax, and Secure when the configured public URL uses HTTPS.
- Sessions expire after seven days and refresh after one day. Cookie session
  caching is not enabled, so expiration and revocation are checked against the
  database immediately.
- Authentication endpoints use Better Auth's origin/CSRF checks and exact
  trusted origins. Redirect destinations are fixed locale routes rather than
  untrusted request parameters.
- Rate limiting is always enabled and stored in PostgreSQL. Email sign-up and
  sign-in are limited to five attempts per minute per Better Auth rate-limit key.

## Registration and recovery policy

Registration is available only in development and guarded isolated tests. In a
normal production runtime, `/api/auth/sign-up/email` returns 404 and the sign-up
page explains that registration is unavailable. Opening production registration
requires an approved email provider, verified-email flow, password recovery,
and production abuse controls. No fake email transport is present.

The registration endpoint disables automatic sign-in so duplicate email
requests receive Better Auth's non-enumerating response. The development UI
then signs in with the submitted credentials and routes a newly created user to
the company-setup-pending page.

Email verification and password recovery are intentionally unavailable in Group
B because no email provider is configured. Social login, MFA, SSO, tenant
membership, and RBAC are also deferred.

## Access policy

The localized dashboard and Products page require a database-validated session
both in their shared layout and at each page before protected content or data is
produced. This page-level guard prevents Next.js parallel rendering from
serializing child content before a layout redirect resolves. The optional
synthetic Products API independently validates its session on every request.

Authenticated users may view the identity-only shell and synthetic catalog.
Those resources contain no tenant data. Authentication alone grants no tenant
membership or access to business records. The post-registration
`/[locale]/pending-setup` page records that boundary until company onboarding is
implemented.

The existing next-intl proxy remains routing-only and excludes all `/api/*`
paths, so `/api/auth/*` is never locale-rewritten. Proxy cookie-presence checks
are not used as a security boundary.

## Schema and migrations

The version-pinned Better Auth CLI generated `user`, `session`, `account`,
`verification`, and `rate_limit`, their relations, indexes, and foreign keys.
The generated PostgreSQL timestamps were changed only to the adapter-supported
`timestamptz` form required by Makhzan's UTC storage rule. Drizzle generated
`0002_cooing_hellcat.sql`; it is applied through the existing migration workflow.

`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, and
`DATABASE_URL` are server-only. Production must provide unique secrets and an
HTTPS public origin. Startup rejects HTTP production origins and the documented
example secrets; only guarded isolated tests may use a loopback HTTP origin.
