# Database-backed Products (Sprint 02 Group D)

## Data and authorization

The existing PostgreSQL `products` table is authoritative. No migration, seed,
quantity/balance column, category/unit table, or dependency is added. A new company
has an empty catalog. The 42 synthetic records remain isolated test fixtures;
neither the page nor the API imports them.

All roles may `products.read`; only OWNER/MANAGER may `products.write`, using the
existing centralized permission matrix. Server-only services validate Better Auth
sessions, lock/revalidate the session and selected tenant/membership, and authorize
inside their database transaction. Reads and writes always predicate `tenant_id`;
product-specific operations also predicate the UUID. Missing and other-tenant IDs
both return `NOT_FOUND`. Inactive products remain readable/editable and can be
reactivated. There is no hard deletion.

Create/edit accept only SKU, name, category code and unit code, plus the required
displayed context version (and existing UUID for edit). Ownership, timestamps,
role and lifecycle injection are rejected by strict Zod schemas. Lifecycle actions
accept only product UUID/context version; target status is chosen on the server.
Session switches cause old-tab mutations to fail `STALE_CONTEXT`, not affect a
different company. Tenant status, role changes and membership revocation are
rechecked under the same locks as the mutation.

SKU/category/unit normalization reuses the database foundation's NFKC/uppercase
rules and post-normalization limits. Category/unit codes are extensible, not the
synthetic fixture enums. Names are trimmed, bounded to 200 characters and reject
control characters. PostgreSQL UUID defaults, tenant/SKU uniqueness and
`set_updated_at` triggers remain unchanged. Duplicate SKU errors map only the
specific unique constraint to `DUPLICATE_SKU`; no SQL or internal errors escape.

## Reads and query contract

Server Components call `listProducts` directly. The existing `GET /api/products`
now provides an explicitly authorized, read-only paginated catalog; the old
`ENABLE_DEMO_PRODUCTS_API` flag is retired. It never exposes a public/demo path.
The API responds with `{data, meta: {total, page, pageSize, pageCount}}`, omits tenant
IDs from product DTOs, and sends `Cache-Control: private, no-store`, `Vary: Cookie`.
Authentication/context failures are 401/403, invalid queries 400, and unavailable
reads generic 500. Other HTTP methods remain unsupported.

| Parameter | Contract / default |
| --- | --- |
| `search` | Trimmed literal SKU/name substring, case-insensitive; max 160 characters; no controls |
| `category` | Exact normalized extensible category code; empty means all |
| `status` | `ALL` (default), `ACTIVE`, `INACTIVE` |
| `sort` | `createdAt` (default), `sku`, `name` |
| `direction` | `desc` (default), `asc` |
| `page` | Positive integer, default 1; bounded and clamped to matching results |
| `pageSize` | 10, 25 (default), 50, 100; UI offers 10/25/50 |

The application parser rejects unknown, repeated, malformed and prototype query
keys. Installed Next.js normalizes the URL before the handler and strips
`__proto__`; HTTP tests verify that these requests retain authorization, bounded
tenant-only results, legitimate filters and private/no-store responses. Raw-parser
unit tests independently verify strict rejection; wire-level 400 rejection of
this framework-stripped key is not claimed. Other unknown keys, including
`constructor`, reach the parser and are rejected. LIKE `%`, `_` and backslash are
escaped and treated literally.
SQL values are parameterized; sorting uses an allowlist, never raw client SQL.
Every order includes UUID ascending as a unique tie-breaker.

One tenant-scoped count and one bounded LIMIT/OFFSET query use identical filters
in a REPEATABLE READ snapshot. An empty catalog returns page 1/pageCount 1 with
zero rows. Auth checks add a fixed number of queries, not one query per product.
Only the requested page reaches the browser; exact counts/deep OFFSET still cost
work proportional to matching/skipped rows. Cursor pagination, search indexes,
estimated counts and additional indexes require measured demand.

## Rendering, mutations and UI

TanStack Table 9.3.1 uses its installed `useTable` feature API and manual filtering,
sorting and pagination. PostgreSQL owns global ordering/filtering; the browser
does not re-sort or filter a retrieved page. Filter submission and sort/page-size
changes reset to page 1. URL state supports refresh/navigation.

Layout/page share only a React **request-scoped** render-context snapshot. Products
listing checks that intent version under fresh transaction authorization before
reading business data; a concurrent switch renders a safe refresh state instead
of mixing the Header's company with another catalog. No shared tenant-data or
authorization cache is introduced.

Server Actions invoke services and call Next.js `refresh()` on success. The table's
stable feedback wrapper survives a page clamp after editing/archiving its final
row; the inner query-keyed view resets drafts/selection. Tenant/version changes
reset the entire workspace. Selection uses UUIDs and applies only to loaded-page
rows; no cross-page bulk/all-server selection is claimed or implemented.

Existing design tokens, desktop table/mobile cards, accessible labeled forms and
confirmations are retained. STAFF/VIEWER see read-only controls; the server rejects
forged writes independently. English/Arabic and RTL strings are paired. Codes stay
LTR; numbers use Western digits and dates use the tenant timezone. Explicit stale
context recovery refreshes the workspace and never automatically retries writes.

## Verification and limitations

`test:products` uses the same guarded real PostgreSQL test database as the existing
suites, running serially. CI retains all existing checks and adds this suite.
Coverage includes CRUD, archive/reactivation, normalization collisions, trigger
timestamps, query boundaries/ties, roles, tenant isolation, context/version changes,
revocation and concurrent duplicate creation. Real HTTP tests exercise compiled
actions, current rendered state, private errors, locale routes and cache isolation.
Old synthetic contract assertions are intentionally replaced with database catalog
assertions; synthetic fixture tests remain.

See [measured query performance](../performance/products-postgres.md). Browser
automation remains blocked by the documented execution policy; real browser visual
and interaction checks for Group D are **NOT VERIFIED**, not replaced by HTTP or
jsdom tests. Existing [Group C browser limits](../verification/group-c-company-selection.md)
remain intact. A local workflow check is not a GitHub-hosted CI run.

Concurrent edits use normal PostgreSQL last-writer-wins behavior; product-level
optimistic edit versions are deferred. Interrupted create responses may require
checking the catalog/duplicate-SKU result before retry. This is not a stock-changing
operation or stock idempotency implementation. RLS, invitations, category reference
integrity/unit conversions, inventory, orders, suppliers and billing remain deferred.
