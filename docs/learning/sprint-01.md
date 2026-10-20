# Sprint 01 — Group C: Quality and Performance

## Test architecture and commands

Vitest has two independent projects:

- `vitest.unit.config.mts` runs pure Unit, service, localization, and jsdom
  component integration tests under `src/**/*.test.{ts,tsx}`. The `server-only`
  alias is a test-only shim; production continues to use Next.js' poison pill.
- `vitest.http.config.mts` runs `tests/http/**/*.test.ts` serially. The harness
  builds Next.js into `.next-http-<pid>`, starts two production servers on
  available loopback ports, waits with a bounded timeout, and always terminates
  the processes and removes generated files. One server explicitly enables the
  demo API and the other verifies the production-disabled contract.

Root commands:

```text
npm run typecheck
npm run lint
npm run test:unit
npm run test:http
npm test
npm run test:watch
npm run benchmark:products
npm run build
```

Docker verification must stop the development service before using its shared
build volume. The production build must override Compose's development
environment with `-e NODE_ENV=production`; the exact commands are in the root
README.

## Coverage and limitations

Automated coverage includes:

- the 42-record Product Service contract, stable/unique IDs and SKUs, record
  cloning, serializability, and field types;
- the actual TanStack Table component's trimmed case-insensitive name/SKU
  search, category/status filters, combined/cleared filters, name/SKU/date
  sorting in both directions, stable ties, pagination, page clamping, ID-based
  selection persistence, empty/no-result states, and mobile-card markup;
- parity and non-empty values across English and Arabic message catalogs;
- real HTTP status, headers, and bodies for the enabled and disabled Products
  API, unsupported methods, and English LTR/Arabic RTL product pages.

The Product Service intentionally exposes only `listProducts`; identifier lookup
and injectable empty storage are therefore not invented for tests. jsdom tests
exercise behavior and accessible controls but do not calculate CSS breakpoints,
layout, paint, or browser-specific focus behavior. Playwright remains deferred:
adding a Chromium binary and OS packages to the slim development image would be
material infrastructure for the current bounded demo. Existing manual Chromium
coverage remains the visual baseline.

## Duplicate SKU utility

`findDuplicateSkus` normalizes each SKU with `trim().toUpperCase()`, returns the
canonical SKU once in the order the duplicate is first encountered, and leaves
the input untouched. Two `Set` instances provide average **O(n)** time and
**O(n)** auxiliary space; string normalization additionally scales with the
total SKU character count. A nested-loop alternative uses less auxiliary space
but takes **O(n²)** comparisons and is unsuitable as the catalog grows.

## Products performance characteristics

| Operation | Current application-side cost | Scaling considerations |
| --- | --- | --- |
| Search | O(n × text length) | Scans name and SKU on the browser main thread. |
| Category/status filtering | O(n) per filter stage | Combined filters remain linear with a small constant number of predicates. |
| Sorting | O(n log n) | TanStack performs stable client-side sorting; string comparison cost is additional. |
| Pagination | O(p) to materialize a page after upstream work | Filtering/sorting still process n rows before slicing to page size p. |
| Row selection | O(1) average per ID toggle; O(n) to derive selected rows | Stable IDs preserve selection across view changes. |
| Duplicate detection | O(n) average time, O(n) space | Uses normalized SKU Sets rather than nested loops. |

The current page receives all products, so network transfer is O(n). It renders
both desktop rows and mobile cards and hides one representation with CSS, making
DOM construction O(p) with a larger constant. A future tenant-scoped database
query should filter/sort before transfer and use indexed ordering plus bounded
pagination; without supporting indexes a database sort can still approach
O(n log n).

## Reproducible benchmark

`npm run benchmark:products` generates deterministic in-memory data rather than
committing datasets. Each operation receives 20 warm-up runs. Measurements use
150 samples at 100 rows, 75 at 1,000 rows, and 30 at 10,000 rows. Results below
were recorded inside the Docker image on Node v24.22.0, Linux/WSL2, Intel Core
i7-8700K. Values are median / p95 milliseconds and are not production or browser
latency claims.

| Rows | Search + filter | Sort | Pagination | Selection scan | Duplicate detection |
| ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 0.005 / 0.012 | 0.006 / 0.010 | 0.000 / 0.000 | 0.004 / 0.004 | 0.009 / 0.016 |
| 1,000 | 0.043 / 0.073 | 0.110 / 0.151 | 0.000 / 0.002 | 0.053 / 0.055 | 0.074 / 0.145 |
| 10,000 | 0.348 / 0.497 | 0.679 / 1.720 | 0.000 / 0.000 | 0.708 / 1.083 | 1.493 / 2.574 |

Pure operations are small at these sizes on this machine; the more important
scaling risks are full-dataset transfer, React/DOM work, and repeated main-thread
processing, none of which this microbenchmark measures.

## Risks and deferred decisions

- Keep the demo at 42 bounded records. Reconsider server-side search, filtering,
  sorting, and pagination when datasets become unbounded or browser profiling
  shows material input/render delay. Consider row virtualization only if large
  page sizes create excessive DOM work.
- Caching, Redis, database integration, authentication, and background workers
  remain outside Group C and require their own product/architecture decisions.
- Playwright browser regression coverage should be reconsidered when browser
  binaries are accepted in the Docker/CI resource budget.
- `npm audit --omit=dev` reports zero production vulnerabilities. The full audit
  reports five high-severity findings in the existing `eslint-config-next`
  development chain; the offered fix is a breaking downgrade and was not
  applied.
