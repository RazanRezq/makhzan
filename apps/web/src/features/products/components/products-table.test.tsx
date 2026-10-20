// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import englishMessages from "../../../../messages/en.json";
import { mockProducts } from "@/server/products/mock-products";
import type { Product } from "@/lib/products/product.types";
import { ProductsTable } from "./products-table";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("@/i18n/navigation", () => ({
  useRouter: () => router,
}));

afterEach(() => {
  cleanup();
  router.refresh.mockReset();
});

function renderProductsTable(
  products: Product[] = mockProducts.map((product) => ({ ...product })),
) {
  return render(
    <NextIntlClientProvider locale="en" messages={englishMessages}>
      <ProductsTable products={products} locale="en" />
    </NextIntlClientProvider>,
  );
}

function productTable() {
  return screen.getByRole("table", {
    name: "Products with category, unit, status, and creation date",
  });
}

function visibleTableProductNames() {
  return within(productTable())
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[1]?.textContent);
}

function firstVisibleProductName() {
  return visibleTableProductNames()[0];
}

describe("ProductsTable search and filtering", () => {
  it("searches names case-insensitively after trimming whitespace", async () => {
    const user = userEvent.setup();
    renderProductsTable();

    await user.type(screen.getByLabelText("Search products"), "  WATER  ");

    expect(screen.getByText("2 products")).toBeTruthy();
    expect(visibleTableProductNames()).toEqual([
      "Still Water 500 ml",
      "Sparkling Water 330 ml",
    ]);
  });

  it("searches by SKU and shows a no-results state", async () => {
    const user = userEvent.setup();
    renderProductsTable();
    const search = screen.getByLabelText("Search products");

    await user.type(search, "pcr-san-001");
    expect(visibleTableProductNames()).toEqual(["Hand Sanitizer 500 ml"]);

    await user.clear(search);
    await user.type(search, "does-not-exist");
    expect(screen.getByRole("heading", { name: "No matching products" })).toBeTruthy();
    expect(screen.getByText("0 products")).toBeTruthy();
  });

  it("combines category, status, and search filters and clears them", async () => {
    const user = userEvent.setup();
    renderProductsTable();

    await user.selectOptions(screen.getByLabelText("Category"), "FOOD");
    await user.selectOptions(screen.getByLabelText("Status"), "INACTIVE");
    await user.type(screen.getByLabelText("Search products"), "chickpeas");

    expect(visibleTableProductNames()).toEqual(["Canned Chickpeas"]);

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("42 products")).toBeTruthy();
    expect(screen.getByLabelText("Category")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Status")).toHaveProperty("value", "");
    expect(screen.getByLabelText("Search products")).toHaveProperty("value", "");
  });
});

describe("ProductsTable sorting", () => {
  it("sorts name, SKU, and creation date in both directions", async () => {
    const user = userEvent.setup();
    renderProductsTable();
    const sort = screen.getByLabelText("Sort by");

    await user.selectOptions(sort, "name-asc");
    expect(firstVisibleProductName()).toBe("A4 Copy Paper");
    await user.selectOptions(sort, "name-desc");
    expect(firstVisibleProductName()).toBe("Thermal Shipping Labels");

    await user.selectOptions(sort, "sku-asc");
    expect(firstVisibleProductName()).toBe("Arabic Coffee Blend");
    await user.selectOptions(sort, "sku-desc");
    expect(firstVisibleProductName()).toBe("Bubble Wrap Roll");

    await user.selectOptions(sort, "createdAt-asc");
    expect(firstVisibleProductName()).toBe("Still Water 500 ml");
    await user.selectOptions(sort, "createdAt-desc");
    expect(firstVisibleProductName()).toBe("Microfiber Cleaning Cloths");
  });

  it("preserves input order as the tie-breaker for equal values", async () => {
    const user = userEvent.setup();
    const tiedProducts: Product[] = [
      { ...mockProducts[0], id: "tie-1", sku: "TIE-002", name: "Same" },
      { ...mockProducts[1], id: "tie-2", sku: "TIE-001", name: "Same" },
      { ...mockProducts[2], id: "tie-3", sku: "TIE-003", name: "After" },
    ];
    renderProductsTable(tiedProducts);

    await user.selectOptions(screen.getByLabelText("Sort by"), "name-asc");

    const rows = within(productTable()).getAllByRole("row").slice(1);
    const skus = rows.map(
      (row) => within(row).getAllByRole("cell")[2]?.textContent,
    );
    expect(skus).toEqual(["TIE-003", "TIE-002", "TIE-001"]);
  });
});

describe("ProductsTable pagination and selection", () => {
  it("uses correct first, last, and selectable page sizes", async () => {
    const user = userEvent.setup();
    const { container } = renderProductsTable();
    const previous = screen.getByRole("button", { name: "Previous page" });
    const next = screen.getByRole("button", { name: "Next page" });

    expect(previous).toHaveProperty("disabled", true);
    expect(visibleTableProductNames()).toHaveLength(10);
    expect(container.querySelectorAll("article")).toHaveLength(10);

    await user.click(next);
    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(screen.getByText("Page 5 of 5")).toBeTruthy();
    expect(visibleTableProductNames()).toHaveLength(2);
    expect(next).toHaveProperty("disabled", true);

    await user.selectOptions(screen.getByLabelText("Rows per page"), "25");
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(visibleTableProductNames()).toHaveLength(17);

    await user.click(previous);
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(visibleTableProductNames()).toHaveLength(25);
  });

  it("resets an invalid page when filtering reduces the result", async () => {
    const user = userEvent.setup();
    renderProductsTable();
    const next = screen.getByRole("button", { name: "Next page" });

    await user.click(next);
    await user.click(next);
    await user.click(next);
    await user.click(next);
    expect(screen.getByText("Page 5 of 5")).toBeTruthy();

    await user.type(screen.getByLabelText("Search products"), "water");
    expect(screen.getByText("Page 1 of 1")).toBeTruthy();
    expect(visibleTableProductNames()).toHaveLength(2);
  });

  it("keeps ID-based selection across sorting, pages, and temporary filters", async () => {
    const user = userEvent.setup();
    renderProductsTable();
    const table = productTable();

    await user.click(
      within(table).getByRole("checkbox", {
        name: "Select Still Water 500 ml",
      }),
    );
    expect(screen.getByText("1 selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    const secondPageFirstProduct = visibleTableProductNames()[0];
    expect(secondPageFirstProduct).toBeTruthy();
    await user.click(
      within(table).getByRole("checkbox", {
        name: `Select ${secondPageFirstProduct}`,
      }),
    );
    expect(screen.getByText("2 selected")).toBeTruthy();

    await user.selectOptions(screen.getByLabelText("Sort by"), "name-desc");
    expect(screen.getByText("2 selected")).toBeTruthy();

    await user.type(screen.getByLabelText("Search products"), "Arabic Coffee");
    expect(screen.getByText("2 selected")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
  });
});

describe("ProductsTable empty behavior", () => {
  it("renders the empty state and refreshes on request", async () => {
    const user = userEvent.setup();
    renderProductsTable([]);

    expect(screen.getByRole("heading", { name: "No products yet" })).toBeTruthy();
    expect(screen.getByText("0 products")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Refresh products" }));
    expect(router.refresh).toHaveBeenCalledOnce();
  });
});
