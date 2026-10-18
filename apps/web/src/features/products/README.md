# Products table performance

The Group B table intentionally loads the 42 synthetic demo products into browser memory.

- Search and combined filtering scan the dataset in `O(n)` time.
- Sorting uses `O(n log n)` time and `O(n)` working memory in the table model.
- Pagination renders at most `p` rows, so the visible table/card work is `O(p)`.
- Row selection uses stable product IDs with approximately `O(s)` memory for `s` selected rows.

This client-side approach is bounded to the demo dataset. The PostgreSQL implementation must move filtering, sorting, and pagination into tenant-scoped server queries rather than sending the complete catalog to the browser.
