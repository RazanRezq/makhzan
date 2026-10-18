"use client";

import { useMemo, useState } from "react";
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
  constructFilterFn,
  createColumnHelper,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  filterFn_equals,
  filterFn_includesString,
  globalFilteringFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  sortFn_text,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type {
  Column,
  ColumnFiltersState,
  PaginationState,
  RowSelectionState,
  SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
} from "@/lib/products/product.types";
import type { Product } from "@/lib/products/product.types";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import {
  categoryTranslationKeys,
  createProductDateFormatter,
  createProductNumberFormatter,
  statusTranslationKeys,
  unitTranslationKeys,
} from "../product-labels";
import { ProductCard } from "./product-card";
import { SelectionCheckbox } from "./selection-checkbox";

type ProductsTableProps = {
  products: Product[];
  locale: string;
};

type SortOption =
  | ""
  | "name-asc"
  | "name-desc"
  | "sku-asc"
  | "sku-desc"
  | "createdAt-desc"
  | "createdAt-asc";

const trimmedIncludesString = constructFilterFn({
  ...filterFn_includesString,
  resolveFilterValue: (value: unknown) =>
    String(value ?? "").trim().toLocaleLowerCase(),
});

const productTableFeatures = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  filterFns: {
    equals: filterFn_equals,
    includesString: trimmedIncludesString,
  },
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { text: sortFn_text },
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
});

const productColumnHelper = createColumnHelper<
  typeof productTableFeatures,
  Product
>();

function SortableHeader<TValue>({
  column,
  label,
  sortAscendingLabel,
  sortDescendingLabel,
}: {
  column: Column<typeof productTableFeatures, Product, TValue>;
  label: string;
  sortAscendingLabel: string;
  sortDescendingLabel: string;
}) {
  const direction = column.getIsSorted();
  const nextLabel = direction === "asc" ? sortDescendingLabel : sortAscendingLabel;

  return (
    <button
      type="button"
      onClick={() => column.toggleSorting(direction === "asc")}
      className="inline-flex min-h-11 items-center gap-2 rounded-md font-medium hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={nextLabel}
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

export function ProductsTable({ products, locale }: ProductsTableProps) {
  const t = useTranslations("Products");
  const router = useRouter();
  const [globalFilter, setGlobalFilter] = useState("");
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 10,
  });

  const dateFormatter = useMemo(() => createProductDateFormatter(locale), [locale]);
  const numberFormatter = useMemo(() => createProductNumberFormatter(locale), [locale]);
  const columns = useMemo(
    () =>
      productColumnHelper.columns([
        productColumnHelper.display({
          id: "select",
          enableColumnFilter: false,
          enableGlobalFilter: false,
          header: ({ table }) => (
            <SelectionCheckbox
              checked={
                table.getIsAllPageRowsSelected()
                  ? true
                  : table.getIsSomePageRowsSelected()
                    ? "indeterminate"
                    : false
              }
              disabled={table.getRowModel().rows.length === 0}
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
        productColumnHelper.accessor("name", {
          sortFn: "text",
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.name")}
              sortAscendingLabel={t("sorting.nameAscending")}
              sortDescendingLabel={t("sorting.nameDescending")}
            />
          ),
          cell: ({ row }) => (
            <span className="font-medium">{row.original.name}</span>
          ),
        }),
        productColumnHelper.accessor("sku", {
          sortFn: "text",
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.sku")}
              sortAscendingLabel={t("sorting.skuAscending")}
              sortDescendingLabel={t("sorting.skuDescending")}
            />
          ),
          cell: ({ row }) => (
            <span className="text-ltr font-mono text-xs">{row.original.sku}</span>
          ),
        }),
        productColumnHelper.accessor("category", {
          header: t("columns.category"),
          cell: ({ row }) => t(categoryTranslationKeys[row.original.category]),
          filterFn: "equals",
          enableSorting: false,
        }),
        productColumnHelper.accessor("unit", {
          header: t("columns.unit"),
          cell: ({ row }) => t(unitTranslationKeys[row.original.unit]),
          enableSorting: false,
        }),
        productColumnHelper.accessor("status", {
          header: t("columns.status"),
          cell: ({ row }) => (
            <span
              className={cn(
                "inline-flex rounded-full px-2.5 py-1 text-xs font-medium",
                row.original.status === "ACTIVE"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t(statusTranslationKeys[row.original.status])}
            </span>
          ),
          filterFn: "equals",
          enableSorting: false,
        }),
        productColumnHelper.accessor("createdAt", {
          sortFn: "text",
          header: ({ column }) => (
            <SortableHeader
              column={column}
              label={t("columns.createdAt")}
              sortAscendingLabel={t("sorting.oldest")}
              sortDescendingLabel={t("sorting.newest")}
            />
          ),
          cell: ({ row }) =>
            dateFormatter.format(new Date(row.original.createdAt)),
        }),
      ]),
    [dateFormatter, t],
  );

  const table = useTable({
    features: productTableFeatures,
    data: products,
    columns,
    state: { globalFilter, columnFilters, sorting, rowSelection, pagination },
    onGlobalFilterChange: setGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    globalFilterFn: "includesString",
    getColumnCanGlobalFilter: (column) =>
      column.id === "name" || column.id === "sku",
    getRowId: (product) => product.id,
    autoResetPageIndex: true,
    enableRowSelection: true,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const selectedCount = table.getSelectedRowModel().rows.length;
  const pageCount = Math.max(1, table.getPageCount());
  const pageRows = table.getRowModel().rows;
  const categoryFilter = String(table.getColumn("category")?.getFilterValue() ?? "");
  const statusFilter = String(table.getColumn("status")?.getFilterValue() ?? "");
  const hasFilters = globalFilter.trim().length > 0 || categoryFilter !== "" || statusFilter !== "";
  const sortOption = getSortOption(sorting);

  function clearFilters() {
    setGlobalFilter("");
    setColumnFilters([]);
    table.setPageIndex(0);
  }

  function updateSort(value: SortOption) {
    switch (value) {
      case "name-asc":
        setSorting([{ id: "name", desc: false }]);
        break;
      case "name-desc":
        setSorting([{ id: "name", desc: true }]);
        break;
      case "sku-asc":
        setSorting([{ id: "sku", desc: false }]);
        break;
      case "sku-desc":
        setSorting([{ id: "sku", desc: true }]);
        break;
      case "createdAt-desc":
        setSorting([{ id: "createdAt", desc: true }]);
        break;
      case "createdAt-asc":
        setSorting([{ id: "createdAt", desc: false }]);
        break;
      default:
        setSorting([]);
    }
    table.setPageIndex(0);
  }

  return (
    <section aria-labelledby="products-table-title" className="min-w-0 space-y-4">
      <h2 id="products-table-title" className="sr-only">
        {t("tableTitle")}
      </h2>

      <div className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(16rem,1fr)_repeat(3,minmax(10rem,auto))_auto] lg:items-end">
          <div className="min-w-0">
            <label htmlFor="product-search" className="mb-2 block text-sm font-medium">
              {t("search.label")}
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <input
                id="product-search"
                type="search"
                value={globalFilter}
                onChange={(event) => {
                  setGlobalFilter(event.target.value);
                  table.setPageIndex(0);
                }}
                placeholder={t("search.placeholder")}
                className="min-h-11 min-w-0 w-full rounded-md border border-input bg-background pe-4 ps-10 text-sm placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
          </div>

          <div className="min-w-0">
            <label htmlFor="category-filter" className="mb-2 block text-sm font-medium">
              {t("filters.category")}
            </label>
            <select
              id="category-filter"
              value={categoryFilter}
              onChange={(event) => {
                table.getColumn("category")?.setFilterValue(event.target.value || undefined);
                table.setPageIndex(0);
              }}
              className="min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">{t("filters.allCategories")}</option>
              {PRODUCT_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {t(categoryTranslationKeys[category])}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="status-filter" className="mb-2 block text-sm font-medium">
              {t("filters.status")}
            </label>
            <select
              id="status-filter"
              value={statusFilter}
              onChange={(event) => {
                table.getColumn("status")?.setFilterValue(event.target.value || undefined);
                table.setPageIndex(0);
              }}
              className="min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">{t("filters.allStatuses")}</option>
              {PRODUCT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(statusTranslationKeys[status])}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-0">
            <label htmlFor="product-sort" className="mb-2 block text-sm font-medium">
              {t("sorting.label")}
            </label>
            <select
              id="product-sort"
              value={sortOption}
              onChange={(event) => updateSort(event.target.value as SortOption)}
              className="min-h-11 min-w-0 w-full max-w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <option value="">{t("sorting.default")}</option>
              <option value="name-asc">{t("sorting.nameAscending")}</option>
              <option value="name-desc">{t("sorting.nameDescending")}</option>
              <option value="sku-asc">{t("sorting.skuAscending")}</option>
              <option value="sku-desc">{t("sorting.skuDescending")}</option>
              <option value="createdAt-desc">{t("sorting.newest")}</option>
              <option value="createdAt-asc">{t("sorting.oldest")}</option>
            </select>
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={clearFilters}
            disabled={!hasFilters}
          >
            <SlidersHorizontal aria-hidden="true" />
            {t("filters.clear")}
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-muted-foreground" aria-live="polite">
        <p>{t("counts.products", { count: numberFormatter.format(filteredCount) })}</p>
        <div className="flex items-center gap-2">
          <SelectionCheckbox
            checked={
              table.getIsAllPageRowsSelected()
                ? true
                : table.getIsSomePageRowsSelected()
                  ? "indeterminate"
                  : false
            }
            disabled={pageRows.length === 0}
            label={t("selection.selectPage")}
            onCheckedChange={(checked) => table.toggleAllPageRowsSelected(checked)}
            className="md:hidden"
          />
          <p>{t("counts.selected", { count: numberFormatter.format(selectedCount) })}</p>
        </div>
      </div>

      {filteredCount === 0 ? (
        <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-muted">
            <PackageOpen className="size-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <h3 className="font-semibold">
            {products.length === 0 ? t("empty.title") : t("noResults.title")}
          </h3>
          <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
            {products.length === 0 ? t("empty.description") : t("noResults.description")}
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-5"
            onClick={products.length === 0 ? () => router.refresh() : clearFilters}
          >
            {products.length === 0 ? t("empty.refresh") : t("filters.clear")}
          </Button>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">{t("tableCaption")}</caption>
              <thead className="border-b bg-muted/60 text-muted-foreground">
                {table.getHeaderGroups().map((headerGroup) => (
                  <tr key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <th key={header.id} scope="col" className="h-12 px-4 text-start font-medium first:w-14">
                        {header.isPlaceholder
                          ? null
                          : <table.FlexRender header={header} />}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
              <tbody>
                {pageRows.map((row) => (
                  <tr
                    key={row.id}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className="border-b last:border-b-0 data-[state=selected]:bg-accent/40"
                  >
                    {row.getAllCells().map((cell) => (
                      <td key={cell.id} className="px-4 py-3 text-start align-middle">
                        <table.FlexRender cell={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:hidden">
            {pageRows.map((row) => (
              <ProductCard
                key={row.id}
                product={row.original}
                locale={locale}
                selected={row.getIsSelected()}
                onSelectedChange={(selected) => row.toggleSelected(selected)}
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
            value={pagination.pageSize}
            onChange={(event) => table.setPageSize(Number(event.target.value))}
            className="min-h-11 rounded-md border border-input bg-background px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {[10, 25, 50].map((pageSize) => (
              <option key={pageSize} value={pageSize}>
                {numberFormatter.format(pageSize)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <span className="text-sm text-muted-foreground">
            {t("pagination.page", {
              page: numberFormatter.format(Math.min(pagination.pageIndex + 1, pageCount)),
              total: numberFormatter.format(pageCount),
            })}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              aria-label={t("pagination.previous")}
            >
              <ChevronLeft className="rtl:rotate-180" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
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

function getSortOption(sorting: SortingState): SortOption {
  const current = sorting[0];
  if (!current) return "";
  if (current.id === "name") return current.desc ? "name-desc" : "name-asc";
  if (current.id === "sku") return current.desc ? "sku-desc" : "sku-asc";
  if (current.id === "createdAt") return current.desc ? "createdAt-desc" : "createdAt-asc";
  return "";
}
