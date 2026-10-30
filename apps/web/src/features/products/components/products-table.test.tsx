// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { DirectionProvider } from "@/components/ui/direction";
import englishMessages from "../../../../messages/en.json";
import arabicMessages from "../../../../messages/ar.json";
import type {
  ProductListItem,
  ProductListResult,
} from "@/lib/products/catalog.types";
import { ProductsTable } from "./products-table";

const mocks = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  create: vi.fn(),
  update: vi.fn(),
  archive: vi.fn(),
  reactivate: vi.fn(),
}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => mocks.router }));
vi.mock("../actions", () => ({
  createProductAction: mocks.create,
  updateProductAction: mocks.update,
  archiveProductAction: mocks.archive,
  reactivateProductAction: mocks.reactivate,
}));

const first: ProductListItem = {
  id: "8ad9ae84-1d42-4b9a-bfb0-e376ed4cf253",
  sku: "Z-002",
  name: "Zulu Item",
  categoryCode: "CUSTOM.ONE",
  unitCode: "KG",
  status: "ACTIVE",
  createdAt: "2026-10-29T12:30:00.000Z",
  updatedAt: "2026-10-29T12:30:00.000Z",
};
const second: ProductListItem = {
  ...first,
  id: "ed980ed7-a19f-4d25-8254-50bc0aa17181",
  sku: "A-001",
  name: "Alpha Item",
};
const defaultListing: ProductListResult = {
  items: [first, second],
  total: 102,
  page: 2,
  pageSize: 25,
  pageCount: 5,
  query: {
    search: "",
    category: "",
    status: "ALL",
    sort: "createdAt",
    direction: "desc",
    page: 2,
    pageSize: 25,
  },
  contextVersion: 9,
  canWrite: true,
  timezone: "Asia/Dubai",
};

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function renderTable(
  change: Partial<ProductListResult> = {},
  locale: "en" | "ar" = "en",
) {
  const listing = { ...defaultListing, ...change };
  return render(tableView(listing, locale));
}
function tableView(listing: ProductListResult, locale: "en" | "ar" = "en") {
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "ar" ? arabicMessages : englishMessages}
    >
      <DirectionProvider dir={locale === "ar" ? "rtl" : "ltr"}>
        <ProductsTable listing={listing} locale={locale} />
      </DirectionProvider>
    </NextIntlClientProvider>
  );
}
function table() {
  return screen.getByRole("table");
}
function rowNames() {
  return within(table())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[2]?.textContent);
}
function lastQuery() {
  const destination = mocks.router.replace.mock.lastCall?.[0];
  expect(destination).toMatch(/^\/products\?/);
  return new URL(String(destination), "http://localhost").searchParams;
}

describe("server-driven ProductsTable", () => {
  it("keeps filters in two columns beside the sidebar until wide desktop", () => {
    renderTable();
    const filterForm = screen
      .getByRole("button", { name: "Apply filters" })
      .closest("form");
    expect(filterForm?.className).toContain("sm:grid-cols-2");
    expect(filterForm?.className).toContain(
      "2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_auto]",
    );
    expect(filterForm?.className).not.toMatch(/\blg:grid-cols-\[/);
    for (const label of ["Search products", "Category", "Status"])
      expect(screen.getByLabelText(label).className).toContain("min-w-0");
  });

  it("shows only the supplied server page with the matching database total", () => {
    const { container } = renderTable();
    expect(rowNames()).toEqual(["Zulu Item", "Alpha Item"]);
    expect(container.querySelectorAll("article")).toHaveLength(2);
    expect(screen.getByText("102 products")).toBeTruthy();
    expect(screen.getByText("Page 2 of 5")).toBeTruthy();
  });

  it("submits trimmed search without filtering the loaded page or fetching while typing", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByLabelText("Search products"), "  water  ");
    expect(mocks.router.replace).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["Zulu Item", "Alpha Item"]);
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(lastQuery().get("search")).toBe("water");
    expect(lastQuery().get("page")).toBe("1");
  });

  it("submits combined search, extensible category and status filters", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.type(screen.getByLabelText("Search products"), "SKU-5");
    await user.type(screen.getByLabelText("Category"), "CUSTOM/TOOLS");
    await user.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    await user.click(screen.getByRole("button", { name: "Apply filters" }));
    expect(Object.fromEntries(lastQuery())).toMatchObject({
      search: "SKU-5",
      category: "CUSTOM/TOOLS",
      status: "INACTIVE",
      page: "1",
    });
  });

  it("requests all six supported sort orders and leaves global ordering to PostgreSQL", async () => {
    const user = userEvent.setup();
    renderTable();
    for (const option of [
      "name-asc",
      "name-desc",
      "sku-asc",
      "sku-desc",
      "createdAt-asc",
      "createdAt-desc",
    ]) {
      await user.selectOptions(screen.getByLabelText("Sort by"), option);
      const [sort, direction] = option.split("-");
      expect(lastQuery().get("sort")).toBe(sort);
      expect(lastQuery().get("direction")).toBe(direction);
      expect(lastQuery().get("page")).toBe("1");
      expect(rowNames()).toEqual(["Zulu Item", "Alpha Item"]);
    }
  });

  it("offers accessible sortable headers and preserves server tie ordering", async () => {
    const user = userEvent.setup();
    renderTable({
      items: [
        { ...first, name: "Same" },
        { ...second, name: "Same" },
      ],
    });
    await user.click(
      within(table()).getByRole("button", { name: "Name: A to Z" }),
    );
    expect(lastQuery().get("sort")).toBe("name");
    const skus = within(table())
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell")[1]?.textContent);
    expect(skus).toEqual(["Z-002", "A-001"]);
  });

  it("requests previous/next pages and resets page size changes to page one", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(lastQuery().get("page")).toBe("3");
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(lastQuery().get("page")).toBe("1");
    await user.selectOptions(screen.getByLabelText("Rows per page"), "50");
    expect(lastQuery().get("pageSize")).toBe("50");
    expect(lastQuery().get("page")).toBe("1");
  });

  it("disables boundary pagination controls on first and last pages", () => {
    const firstPage = renderTable({
      page: 1,
      query: { ...defaultListing.query, page: 1 },
    });
    expect(
      screen.getByRole("button", { name: "Previous page" }),
    ).toHaveProperty("disabled", true);
    firstPage.unmount();
    renderTable({ page: 5, query: { ...defaultListing.query, page: 5 } });
    expect(screen.getByRole("button", { name: "Next page" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("uses stable UUID selection for only the loaded page and clears on navigation", async () => {
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(table()).getByRole("checkbox", { name: "Select Zulu Item" }),
    );
    expect(screen.getByText("1 selected on this page")).toBeTruthy();
    await user.click(
      within(table()).getByRole("checkbox", {
        name: "Select all products on this page",
      }),
    );
    expect(screen.getByText("2 selected on this page")).toBeTruthy();
    expect(
      screen.getByText(englishMessages.Products.selection.pageOnly),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("0 selected on this page")).toBeTruthy();
  });

  it("clears filters without changing the chosen page size and sort order", async () => {
    const user = userEvent.setup();
    renderTable({
      query: {
        ...defaultListing.query,
        search: "nothing",
        category: "TOOLS",
        status: "ACTIVE",
      },
    });
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(lastQuery().has("search")).toBe(false);
    expect(lastQuery().has("category")).toBe(false);
    expect(lastQuery().has("status")).toBe(false);
    expect(lastQuery().get("page")).toBe("1");
    expect(lastQuery().get("pageSize")).toBe("25");
    expect(lastQuery().get("sort")).toBe("createdAt");
  });

  it("shows a true empty catalog with a writer CTA", async () => {
    const user = userEvent.setup();
    renderTable({ items: [], total: 0, page: 1, pageCount: 1 });
    expect(
      screen.getByRole("heading", { name: "No products yet" }),
    ).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add product" }));
    expect(
      await screen.findByRole("dialog", { name: "Add product" }),
    ).toBeTruthy();
  });

  it("distinguishes no matching results from an empty company catalog", () => {
    renderTable({
      items: [],
      total: 0,
      canWrite: false,
      page: 1,
      pageCount: 1,
      query: { ...defaultListing.query, search: "missing" },
    });
    expect(
      screen.getByRole("heading", { name: "No matching products" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: "No products yet" }),
    ).toBeNull();
  });

  it("removes all functional write controls for STAFF/VIEWER listings", () => {
    renderTable({ canWrite: false });
    expect(screen.queryByRole("button", { name: "Add product" })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Edit / })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Archive / })).toBeNull();
  });

  it("renders Arabic controls, Western digits, LTR identifiers and the supplied timezone", () => {
    const { container } = renderTable(
      {
        items: [{ ...first, createdAt: "2026-10-29T00:30:00.000Z" }],
        timezone: "America/New_York",
      },
      "ar",
    );
    expect(
      screen.getByRole("button", { name: "تطبيق عوامل التصفية" }),
    ).toBeTruthy();
    expect(screen.getByText("102 منتج")).toBeTruthy();
    expect(screen.getAllByText("Z-002")[0]?.className).toContain("text-ltr");
    expect(container.querySelectorAll("article")).toHaveLength(1);
    const rowText = within(table())
      .getAllByRole("row")[1]
      ?.textContent?.replace(/[\u200e\u200f]/g, "");
    expect(rowText).toContain("28/10/2026");
    expect(rowText).not.toMatch(/[٠-٩]/);
  });
});

async function openCreate() {
  const user = userEvent.setup();
  renderTable();
  await user.click(screen.getByRole("button", { name: "Add product" }));
  const dialog = await screen.findByRole("dialog", { name: "Add product" });
  return { user, dialog };
}
async function fillProduct(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.type(within(dialog).getByLabelText("SKU"), "ｓｋｕ-００１");
  await user.type(within(dialog).getByLabelText("Product name"), " New item ");
  await user.type(within(dialog).getByLabelText("Category code"), "tools");
  await user.type(within(dialog).getByLabelText("Unit code"), "box");
}

describe("Products mutations", () => {
  it("validates all product fields before sending a mutation", async () => {
    const { user, dialog } = await openCreate();
    await user.click(
      within(dialog).getByRole("button", { name: "Create product" }),
    );
    for (const field of ["sku", "name", "categoryCode", "unitCode"] as const)
      expect(
        within(dialog).getByText(englishMessages.Products.validation[field]),
      ).toBeTruthy();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("sends canonical codes and context version, closes on success and uses the action's refresh", async () => {
    mocks.create.mockResolvedValue({ ok: true, product: first });
    const { user, dialog } = await openCreate();
    await fillProduct(user, dialog);
    await user.click(
      within(dialog).getByRole("button", { name: "Create product" }),
    );
    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith({
        sku: "SKU-001",
        name: "New item",
        categoryCode: "TOOLS",
        unitCode: "BOX",
        expectedVersion: 9,
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByText("Product created.")).toBeTruthy();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
  });

  it("shows a safe duplicate-SKU error without claiming success", async () => {
    mocks.create.mockResolvedValue({ ok: false, code: "DUPLICATE_SKU" });
    const { user, dialog } = await openCreate();
    await fillProduct(user, dialog);
    await user.click(
      within(dialog).getByRole("button", { name: "Create product" }),
    );
    expect(
      await screen.findByText(englishMessages.Products.errors.DUPLICATE_SKU),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Product created.")).toBeNull();
  });

  it("disables submission while a mutation is pending", async () => {
    let finish:
      ((value: { ok: true; product: ProductListItem }) => void) | undefined;
    mocks.create.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const { user, dialog } = await openCreate();
    await fillProduct(user, dialog);
    await user.click(
      within(dialog).getByRole("button", { name: "Create product" }),
    );
    expect(
      await screen.findByRole("button", { name: "Saving…" }),
    ).toHaveProperty("disabled", true);
    finish?.({ ok: true, product: first });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("loads existing values and preserves the product ID on edit", async () => {
    mocks.update.mockResolvedValue({ ok: true, product: first });
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(table()).getByRole("button", { name: "Edit Zulu Item" }),
    );
    const dialog = await screen.findByRole("dialog", { name: "Edit product" });
    expect(within(dialog).getByLabelText("SKU")).toHaveProperty(
      "value",
      "Z-002",
    );
    await user.clear(within(dialog).getByLabelText("Product name"));
    await user.type(
      within(dialog).getByLabelText("Product name"),
      "Changed item",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith({
        id: first.id,
        sku: first.sku,
        name: "Changed item",
        categoryCode: first.categoryCode,
        unitCode: first.unitCode,
        expectedVersion: 9,
      }),
    );
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("requires explicit archival confirmation and retains the context version", async () => {
    mocks.archive.mockResolvedValue({
      ok: true,
      product: { ...first, status: "INACTIVE" },
    });
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(table()).getByRole("button", { name: "Archive Zulu Item" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Archive product?",
    });
    expect(mocks.archive).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm archive" }),
    );
    await waitFor(() =>
      expect(mocks.archive).toHaveBeenCalledWith({
        id: first.id,
        expectedVersion: 9,
      }),
    );
    expect(await screen.findByText("Product archived.")).toBeTruthy();
  });

  it("preserves success feedback when the action refresh clamps the last page", async () => {
    let finish:
      ((value: { ok: true; product: ProductListItem }) => void) | undefined;
    mocks.archive.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const user = userEvent.setup();
    const initial: ProductListResult = {
      ...defaultListing,
      items: [first],
      total: 26,
      pageCount: 2,
      query: { ...defaultListing.query, status: "ACTIVE" },
    };
    const view = renderTable(initial);
    await user.click(
      within(table()).getByRole("button", { name: "Archive Zulu Item" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Archive product?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm archive" }),
    );
    // Next's action refresh can commit new RSC props before the action promise
    // resolves. The current page changes, but the tenant/context wrapper stays.
    const refreshed = {
      ...initial,
      items: [second],
      total: 25,
      page: 1,
      pageCount: 1,
      query: { ...initial.query, page: 1 },
    };
    view.rerender(tableView(refreshed));
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    await act(async () => {
      finish?.({ ok: true, product: { ...first, status: "INACTIVE" } });
    });
    expect(await screen.findByText("Product archived.")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.selectOptions(screen.getByLabelText("Sort by"), "sku-asc");
    expect(screen.queryByText("Product archived.")).toBeNull();
  });

  it("reactivates inactive products through the separate protected action", async () => {
    mocks.reactivate.mockResolvedValue({ ok: true, product: first });
    const user = userEvent.setup();
    renderTable({ items: [{ ...first, status: "INACTIVE" }] });
    await user.click(
      within(table()).getByRole("button", { name: "Reactivate Zulu Item" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Reactivate product?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm reactivation" }),
    );
    await waitFor(() =>
      expect(mocks.reactivate).toHaveBeenCalledWith({
        id: first.id,
        expectedVersion: 9,
      }),
    );
    expect(mocks.archive).not.toHaveBeenCalled();
  });

  it("shows stale-context failures without closing the form or claiming success", async () => {
    mocks.create.mockResolvedValue({ ok: false, code: "STALE_CONTEXT" });
    const { user, dialog } = await openCreate();
    await fillProduct(user, dialog);
    await user.click(
      within(dialog).getByRole("button", { name: "Create product" }),
    );
    expect(
      await screen.findByText(englishMessages.Products.errors.STALE_CONTEXT),
    ).toBeTruthy();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.queryByText("Product created.")).toBeNull();
    expect(mocks.create).toHaveBeenCalledOnce();
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    await user.click(
      within(dialog).getByRole("button", { name: "Refresh workspace" }),
    );
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    expect(mocks.create).toHaveBeenCalledOnce();
  });

  it("offers explicit stale-context recovery for archival without retrying it", async () => {
    mocks.archive.mockResolvedValue({ ok: false, code: "STALE_CONTEXT" });
    const user = userEvent.setup();
    renderTable();
    await user.click(
      within(table()).getByRole("button", { name: "Archive Zulu Item" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Archive product?",
    });
    await user.click(
      within(dialog).getByRole("button", { name: "Confirm archive" }),
    );
    const recovery = await within(dialog).findByRole("button", {
      name: "Refresh workspace",
    });
    expect(mocks.router.refresh).not.toHaveBeenCalled();
    expect(mocks.archive).toHaveBeenCalledOnce();
    await user.click(recovery);
    expect(mocks.router.refresh).toHaveBeenCalledOnce();
    expect(mocks.archive).toHaveBeenCalledOnce();
  });
});
