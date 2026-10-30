# PostgreSQL Products query measurements

Measured 29 October 2026 in Docker: Node 24.22.0, PostgreSQL 16.15, Linux/WSL2,
Intel Core i7-8700K @ 3.70GHz. One PostgreSQL client on the local Compose network;
1,000 and 10,000 target-tenant rows plus the same number of other-tenant rows.
Existing small integration fixtures were retained. Synthetic benchmark inserts
were rolled back; post-run fixture preservation passed. No development DB is used.

`npm run benchmark:products:db` requires `NODE_ENV=test`, a local/`postgres-test`
host and exactly `makhzan_test`. It refuses other databases. Run after test
migrations, not concurrently with suites that reset the test schema.

Each shape uses parameterized `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, one warm-up,
then five measurements with warm caches after insertion/ANALYZE. These are
PostgreSQL execution milliseconds, **not HTTP latency, an application load test,
or a latency SLO**. With five samples the reported p95 is effectively the maximum.
Planning times, scan/sort nodes, index names and buffer hits/reads are printed by
the reproducible script. No indexes or planner settings were added/forced.

| Query shape | 1k median ms | 10k median ms | 10k p95 ms | Rows returned |
| --- | ---: | ---: | ---: | ---: |
| First page, created date descending | 0.024 | 0.016 | 0.016 | 25 |
| SKU ascending | 0.036 | 0.028 | 0.028 | 25 |
| Name ascending | 0.585 | 3.802 | 3.833 | 25 |
| SKU/name substring search | 0.054 | 9.997 | 10.092 | 25 |
| Search + category + status, name order | 0.668 | 5.264 | 5.366 | 25 |
| Final-page created-date OFFSET | 0.406 | 3.576 | 3.705 | 25 |
| Exact tenant count | 0.236 | 1.947 | 2.067 | 1 aggregate |
| Exact combined-filter count | 0.559 | 4.507 | 4.685 | 1 aggregate |

The service executes count and page queries, plus fixed authentication/authorization
queries and serialization. These isolated query timings must not be reported as
end-to-end response times. At default size only 25 product DTOs reach the client,
not all 1k/10k matching/tenant records; maximum requested page size is 100.

## Index findings and evidence-based adjustment

- The existing `(tenant_id, created_at DESC NULLS LAST, id)` index serves the
  default page without a sort. Initial SQL omitted explicit null ordering and
  PostgreSQL chose sequential scan/top-N sort: 2.849ms median at 10k. Matching
  `DESC NULLS LAST` reduced this sampled page query to 0.016ms. `created_at` is
  NOT NULL, so this changes no result semantics and requires no migration.
- SKU sorting uses `products_tenant_sku_unique`. The UUID tie-breaker remains
  deterministic; SKU uniqueness per tenant already prevents SKU ties.
- Name sorting and combined filters chose sequential scans/sorts in this fixture.
  Arbitrary substring search can scan many candidates even when using the
  created-date index; 10k search returned 25 while examining more rows. B-tree
  uniqueness does not make leading-wildcard ILIKE an indexed text search.
- Exact counts scan matching candidates; LIMIT does not reduce counting work.
  Deep OFFSET scans/skips rows and was materially slower than the first page.

No extra index is justified solely by these small warm single-client measurements.
Before adding name/category/status indexes or trigram/full-text infrastructure,
measure representative tenant distributions, cold cache, concurrency, query mix
and the count path. Consider cursor pagination when deep-offset pages become
frequent/large; it will require a separate UX/count contract. No Redis, caching,
virtualization, sharding, workers or schema changes were introduced.
