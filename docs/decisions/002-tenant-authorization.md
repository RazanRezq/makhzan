# Tenant membership and authorization

Status: approved for Sprint 02 Group C, 27 October 2026.

Makhzan owns companies through the existing `tenants` table. Better Auth owns
identity and sessions. Use custom tenant memberships and centralized resource/action
permissions; do not enable Better Auth's Organization Plugin or create a second
company model. No additional dependency is required.

The Organization Plugin supports schema mapping and custom roles, but the installed
1.7.12 company-creation path does not wrap company, member, and session changes in
one transaction. Its final-owner guards also need concurrency coordination for our
requirements. A small application-owned service provides those invariants directly.
The trade-off is that Makhzan maintains the membership rules and their tests.

The approved design adds memberships, session company selection, successful
onboarding receipts, and authenticated creation-attempt records. Company selection
is shared by tabs in the same session. Context versions reject stale mutations.
Membership and tenant status are always checked against PostgreSQL.

Initial onboarding creates the first company only. Any previous membership or
successful onboarding receipt prevents another creation; additional-company
creation, invitations, custom roles, RLS, and business CRUD are deferred.

See [tenant architecture](../architecture/tenancy.md) for constraints, permissions,
locking, retry behavior, tests, and limitations.
