# Authentication architecture

**Scope:** Sprint 02 Group B identity/session management, integrated with the
Group C [tenant architecture](tenancy.md). Better Auth owns identity; Makhzan owns
membership, RBAC, and tenant selection. Invitations and organization management
beyond first-company onboarding remain deferred.

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
- Logout only redirects after Better Auth confirms success. Failed or interrupted
  requests show a translated retry message; the UI does not claim revocation.

Before a public deployment, configure and verify the trusted ingress: it must
overwrite/sanitize the client IP header, and the application origin must be
reachable only through that ingress. The current Better Auth default reads
`X-Forwarded-For`. A directly exposed server can accept forged single-value IP
headers; an unresolved IP can skip rate limiting in production. The database
limiter is tested across instances and concurrent requests, but that does not
prove a deployment's proxy trust configuration. Hosting is deferred; no hosting
provider or proxy trust range is assumed here. See the
[Better Auth rate-limit requirements](https://better-auth.com/docs/concepts/rate-limit).

## Registration and recovery policy

Registration is available only in development and guarded isolated tests. In a
normal production runtime, `/api/auth/sign-up/email` returns 404 and the sign-up
page explains that registration is unavailable. Opening production registration
requires an approved email provider, verified-email flow, password recovery,
and production abuse controls. No fake email transport is present.

The registration endpoint disables automatic sign-in so duplicate email
requests receive Better Auth's non-enumerating response. The development UI
then signs in with the submitted credentials and routes a newly created user to
the localized company-onboarding page.

Email verification and password recovery are intentionally unavailable in Group
B because no email provider is configured. Social login, MFA, and SSO remain deferred.

## Access policy

The localized dashboard and Products page require a database-validated session
both in their shared layout and at each page before protected content or data is
produced. This page-level guard prevents Next.js parallel rendering from
serializing child content before a layout redirect resolves. The optional
synthetic Products API independently validates its session on every request.

Dashboard and synthetic catalog access now additionally require a current active
tenant membership and active tenant selection. Authentication alone grants no
tenant access. Users without eligible memberships go to `/[locale]/onboarding`
(prior members see a safe no-access state, not a new-company form). An authenticated,
origin-checked POST establishes a sole eligible company only when the session has
never selected one; multiple memberships require `/[locale]/select-company`.
Invalid/revoked contexts are never silently replaced. Sign-in resolves this before
navigation; direct visits use a neutral POST bootstrap. GET/rendering is read-only.
`pending-setup` is a compatibility redirect.
Every page/API performs its own service check before producing protected content.

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

## Final security review coverage

The follow-up Group B checks cover rejection of documented production secrets,
insecure origins, and misuse of the isolated-test flag; forged and expired
sessions; immediate access denial after logout; hostile or missing mutation
origins; external callback URLs; generic credential errors; concurrent database
rate limiting; and authenticated attempts to select a real tenant's product data.
The latter asserts the current catalog remains synthetic; it does not implement
or certify future membership/RBAC authorization. The auth migration only adds
identity tables, indexes, and foreign keys, and leaves business rows intact.

CI reports the full dependency audit without filtering out the four moderate
esbuild-chain entries. Their reachability assessment and remediation limitation
are recorded in the root README. Production deployment remains out of scope.
