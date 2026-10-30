"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  PackageOpen,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  columnFilteringFeature,
  createColumnHelper,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { Column, RowSelectionState } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import type {
  ProductListItem,
  ProductListResult,
  ProductQuery,
} from "@/lib/products/catalog.types";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import { ProductCard } from "./product-card";
import { ProductEditor, ProductLifecycle } from "./product-editor";
import { SelectionCheckbox } from "./selection-checkbox";

const features = tableFeatures({
  columnFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
});
const columnHelper = createColumnHelper<typeof features, ProductListItem>();
const inputStyle =
  "min-h-11 min-w-0 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function SortableHeader<TValue>({
  column,
  label,
  ascending,
  descending,
  onSort,
}: {
  column: Column<typeof features, ProductListItem, TValue>;
  label: string;
  ascending: string;
  descending: string;
  onSort: () => void;
}) {
  const direction = column.getIsSorted();
  return (
    <button
      type="button"
      onClick={onSort}
      className="inline-flex min-h-11 items-center gap-2 rounded-md font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={direction === "asc" ? descending : ascending}
    >
      {label}
      {direction === "asc" ? (
        <ArrowUp className="size-4" aria-hidden="true" />
      ) : direction === "desc" ? (
        <ArrowDown className="size-4" aria-hidden="true" />
      ) : (
        <ArrowUpDown className="size-4" aria-hidden="true" />
      )}
    </button>
  );
}

export function ProductsTable({
  listing,
  locale,
}: {
  listing: ProductListResult;
  locale: string;
}) {
  // The outer component is keyed by tenant/context in the Server Component.
  // Keep feedback here when a successful mutation clamps the current page.
  const [notice, setNotice] = useState<string>();
  return (
    <ProductsTablePage
      key={JSON.stringify(listing.query)}
      listing={listing}
      locale={locale}
      notice={notice}
      setNotice={setNotice}
    />
  );
}

function ProductsTablePage({
  listing,
  locale,
  notice,
  setNotice,
}: {
  listing: ProductListResult;
  locale: string;
  notice: string | undefined;
  setNotice: (notice: string | undefined) => void;
}) {
  const t = useTranslations("Products");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(listing.query.search);
  const [category, setCategory] = useState(listing.query.category);
  const [status, setStatus] = useState<ProductQuery["status"]>(
    listing.query.status,
  );
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const numbers = useMemo(
    () => new Intl.NumberFormat(locale, { numberingSystem: "latn" }),
    [locale],
  );
  const dates = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        numberingSystem: "latn",
        timeZone: listing.timezone,
      }),
    [locale, listing.timezone],
  );
  const hasFilters = Boolean(
    listing.query.search ||
    listing.query.category ||
    listing.query.status !== "ALL",
  );

  const navigate = useCallback(
    (change: Partial<ProductQuery>) => {
      const next = { ...listing.query, ...change };
      const params = new URLSearchParams();
      if (next.search) params.set("search", next.search);
      if (next.category) params.set("category", next.category);
      if (next.status !== "ALL") params.set("status", next.status);
      params.set("sort", next.sort);
      params.set("direction", next.direction);
      params.set("page", String(next.page));
      params.set("pageSize", String(next.pageSize));
      setRowSelection({});
      setNotice(undefined);
      startTransition(() => router.replace(`/products?${params.toString()}`));
    },
    [listing.query, router, setNotice],
  );

  function clearFilters() {
    setSearch("");
    setCategory("");
    setStatus("ALL");
    navigate({ search: "", category: "", status: "ALL", page: 1 });
  }

  function submitFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    navigate({
      search: search.trim(),
      category: category.trim(),
      status,
      page: 1,
    });
  }

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.display({
          id: "select",
          header: ({ table }) => (
            <SelectionCheckbox
              checked={
                table.getIsAllPageRowsSelected()
                  ? true
                  : table.getIsSomePageRowsSelected()
                    ? "indeterminate"
                    : false
              }
              label={t("selection.selectPage")}
              onCheckedChange={(checked) =>
                table.toggleAllPageRowsSelected(checked)
              }
            />
          ),
          cell: ({ row }) => (
            <SelectionCheckbox
              checked={row.getIsSelected()}
              label={t("selection.selectProduct", { name: row.original.name })}
              onCheckedChange={(checked) => row.toggleSelected(checked)}
            />
          ),
        }),
        columnHelper.accessor("sku", {
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.sku")}
              ascending={t("sorting.skuAscending")}
              descending={t("sorting.skuDescending")}
              onSort={() =>
                navigate({
                  sort: "sku",
                  direction:
                    listing.query.sort === "sku" &&
                    listing.query.direction === "asc"
                      ? "desc"
                      : "asc",
                  page: 1,
                })
              }
            />
          ),
          cell: ({ row }) => (
            <span className="text-ltr break-all font-mono text-xs">
              {row.original.sku}
            </span>
          ),
        }),
        columnHelper.accessor("name", {
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.name")}
              ascending={t("sorting.nameAscending")}
              descending={t("sorting.nameDescending")}
              onSort={() =>
                navigate({
                  sort: "name",
                  direction:
                    listing.query.sort === "name" &&
                    listing.query.direction === "asc"
                      ? "desc"
                      : "asc",
                  page: 1,
                })
              }
            />
          ),
          cell: ({ row }) => (
            <span className="break-words font-medium">{row.original.name}</span>
          ),
        }),
        columnHelper.accessor("categoryCode", {
          header: t("columns.category"),
          enableSorting: false,
          cell: ({ row }) => (
            <span className="text-ltr break-all">
              {row.original.categoryCode}
            </span>
          ),
        }),
        columnHelper.accessor("unitCode", {
          header: t("columns.unit"),
          enableSorting: false,
          cell: ({ row }) => (
            <span className="text-ltr break-all">{row.original.unitCode}</span>
          ),
        }),
        columnHelper.accessor("status", {
          header: t("columns.status"),
          enableSorting: false,
          cell: ({ row }) => (
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                row.original.status === "ACTIVE"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t(
                row.original.status === "ACTIVE"
                  ? "statuses.active"
                  : "statuses.inactive",
              )}
            </span>
          ),
        }),
        columnHelper.accessor("createdAt", {
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.createdAt")}
              ascending={t("sorting.oldest")}
              descending={t("sorting.newest")}
              onSort={() =>
                navigate({
                  sort: "createdAt",
                  direction:
                    listing.query.sort === "createdAt" &&
                    listing.query.direction === "asc"
                      ? "desc"
                      : "asc",
                  page: 1,
                })
              }
            />
          ),
          cell: ({ row }) => dates.format(new Date(row.original.createdAt)),
        }),
        columnHelper.display({
          id: "actions",
          header: t("columns.actions"),
          cell: ({ row }) =>
            listing.canWrite ? (
              <div className="flex flex-wrap gap-1">
                <ProductEditor
                  product={row.original}
                  contextVersion={listing.contextVersion}
                  onSuccess={() => setNotice(t("feedback.updated"))}
                />
                <ProductLifecycle
                  product={row.original}
                  contextVersion={listing.contextVersion}
                  onSuccess={() =>
                    setNotice(
                      t(
                        row.original.status === "ACTIVE"
                          ? "feedback.archived"
                          : "feedback.reactivated",
                      ),
                    )
                  }
                />
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {t("readOnly")}
              </span>
            ),
        }),
      ]),
    [
      dates,
      listing.canWrite,
      listing.contextVersion,
      listing.query.sort,
      listing.query.direction,
      navigate,
      setNotice,
      t,
    ],
  );

  const table = useTable({
    features,
    data: listing.items,
    columns,
    state: {
      rowSelection,
      sorting: [
        { id: listing.query.sort, desc: listing.query.direction === "desc" },
      ],
      pagination: { pageIndex: listing.page - 1, pageSize: listing.pageSize },
    },
    onRowSelectionChange: setRowSelection,
    manualFiltering: true,
    manualSorting: true,
    manualPagination: true,
    rowCount: listing.total,
    pageCount: listing.pageCount,
    autoResetPageIndex: false,
    getRowId: (product) => product.id,
    enableRowSelection: true,
  });
  const rows = table.getRowModel().rows;
  const addProduct = (
    <ProductEditor
      contextVersion={listing.contextVersion}
      onSuccess={() => setNotice(t("feedback.created"))}
    />
  );

  return (
    <section
      aria-labelledby="products-table-title"
      aria-busy={pending}
      className="min-w-0 space-y-4"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="products-table-title" className="sr-only">
          {t("tableTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">{t("serverProcessing")}</p>
        {listing.canWrite && (listing.total > 0 || hasFilters)
          ? addProduct
          : null}
      </div>
      <form
        onSubmit={submitFilters}
        className="grid min-w-0 gap-4 rounded-xl border bg-card p-4 sm:grid-cols-2 sm:p-5 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto] 2xl:items-end"
      >
        <div className="min-w-0">
          <label
            htmlFor="product-search"
            className="mb-2 block text-sm font-medium"
          >
            {t("search.label")}
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <input
              id="product-search"
              name="search"
              type="search"
              maxLength={160}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("search.placeholder")}
              className={`${inputStyle} ps-10`}
              disabled={pending}
            />
          </div>
        </div>
        <div className="min-w-0">
          <label
            htmlFor="category-filter"
            className="mb-2 block text-sm font-medium"
          >
            {t("filters.category")}
          </label>
          <input
            id="category-filter"
            name="category"
            value={category}
            maxLength={64}
            onChange={(event) => setCategory(event.target.value)}
            placeholder={t("filters.allCategories")}
            className={`${inputStyle} text-ltr`}
            disabled={pending}
          />
        </div>
        <div className="min-w-0">
          <label
            htmlFor="status-filter"
            className="mb-2 block text-sm font-medium"
          >
            {t("filters.status")}
          </label>
          <select
            id="status-filter"
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ProductQuery["status"])
            }
            className={inputStyle}
            disabled={pending}
          >
            <option value="ALL">{t("filters.allStatuses")}</option>
            <option value="ACTIVE">{t("statuses.active")}</option>
            <option value="INACTIVE">{t("statuses.inactive")}</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            {t("filters.apply")}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            disabled={
              pending ||
              (!hasFilters && !search && !category && status === "ALL")
            }
          >
            <SlidersHorizontal aria-hidden="true" />
            {t("filters.clear")}
          </Button>
        </div>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground">
        <div aria-live="polite">
          <p>
            {t("counts.products", { count: numbers.format(listing.total) })}
          </p>
          <p className="mt-1 text-xs">
            {t("counts.selected", {
              count: numbers.format(table.getSelectedRowModel().rows.length),
            })}
          </p>
        </div>
        <div className="flex min-w-0 items-center gap-3">
          <label htmlFor="product-sort" className="shrink-0 text-sm">
            {t("sorting.label")}
          </label>
          <select
            id="product-sort"
            value={`${listing.query.sort}-${listing.query.direction}`}
            onChange={(event) => {
              const [sort, direction] = event.target.value.split("-");
              navigate({
                sort: sort as ProductQuery["sort"],
                direction: direction as ProductQuery["direction"],
                page: 1,
              });
            }}
            className="min-h-11 min-w-0 max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          >
            <option value="name-asc">{t("sorting.nameAscending")}</option>
            <option value="name-desc">{t("sorting.nameDescending")}</option>
            <option value="sku-asc">{t("sorting.skuAscending")}</option>
            <option value="sku-desc">{t("sorting.skuDescending")}</option>
            <option value="createdAt-desc">{t("sorting.newest")}</option>
            <option value="createdAt-asc">{t("sorting.oldest")}</option>
          </select>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("selection.pageOnly")}</p>
      <div role="status" aria-live="polite">
        {pending ? t("loading.label") : notice}
      </div>
      {rows.length === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center">
          <PackageOpen
            className="mb-4 size-8 text-muted-foreground"
            aria-hidden="true"
          />
          <h3 className="font-semibold">
            {t(hasFilters ? "noResults.title" : "empty.title")}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {t(hasFilters ? "noResults.description" : "empty.description")}
          </p>
          <div className="mt-5">
            {hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>
                {t("filters.clear")}
              </Button>
            ) : listing.canWrite ? (
              addProduct
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("empty.readOnly")}
              </p>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t("tableCaption")}</caption>
              <thead className="border-b bg-muted/60 text-muted-foreground">
                {table.getHeaderGroups().map((group) => (
                  <tr key={group.id}>
                    {group.headers.map((header) => (
                      <th
                        key={header.id}
                        scope="col"
                        aria-sort={
                          header.column.getIsSorted() === "asc"
                            ? "ascending"
                            : header.column.getIsSorted() === "desc"
                              ? "descending"
                              : undefined
                        }
                        className="h-12 px-4 text-start font-medium first:w-14"
                      >
                        {header.isPlaceholder ? null : (
                          <table.FlexRender header={header} />
                        )}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="border-b last:border-b-0 data-[state=selected]:bg-accent/40"
                  >
                    {row.getAllCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3 text-start align-middle"
                      >
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:hidden">
            {rows.map((row) => (
              <ProductCard
                key={row.id}
                product={row.original}
                locale={locale}
                timezone={listing.timezone}
                selected={row.getIsSelected()}
                onSelectedChange={(checked) => row.toggleSelected(checked)}
                actions={
                  listing.canWrite ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <ProductEditor
                        product={row.original}
                        contextVersion={listing.contextVersion}
                        onSuccess={() => setNotice(t("feedback.updated"))}
                      />
                      <ProductLifecycle
                        product={row.original}
                        contextVersion={listing.contextVersion}
                        onSuccess={() =>
                          setNotice(
                            t(
                              row.original.status === "ACTIVE"
                                ? "feedback.archived"
                                : "feedback.reactivated",
                            ),
                          )
                        }
                      />
                    </div>
                  ) : null
                }
              />
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col gap-4 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <label htmlFor="page-size" className="text-sm text-muted-foreground">
            {t("pagination.rowsPerPage")}
          </label>
          <select
            id="page-size"
            value={listing.pageSize}
            onChange={(event) =>
              navigate({ pageSize: Number(event.target.value), page: 1 })
            }
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            disabled={pending}
          >
            {[10, 25, 50, ...(listing.pageSize === 100 ? [100] : [])].map(
              (size) => (
                <option key={size} value={size}>
                  {numbers.format(size)}
                </option>
              ),
            )}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm text-muted-foreground">
            {t("pagination.page", {
              page: numbers.format(listing.page),
              total: numbers.format(Math.max(1, listing.pageCount)),
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => navigate({ page: listing.page - 1 })}
              disabled={pending || listing.page <= 1}
              aria-label={t("pagination.previous")}
            >
              <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => navigate({ page: listing.page + 1 })}
              disabled={pending || listing.page >= listing.pageCount}
              aria-label={t("pagination.next")}
            >
              <ChevronRight className="rtl:rotate-180" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
