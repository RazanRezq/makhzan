import { describe, expect, it } from "vitest";
import {
  PRODUCT_CATEGORIES,
  PRODUCT_STATUSES,
  PRODUCT_UNITS,
} from "@/lib/products/product.types";
import { mockProducts } from "./mock-products";
import { listDemoProducts as listProducts } from "./demo-products";

describe("isolated synthetic fixture", () => {
  it("returns the complete deterministic product fixture", async () => {
    const products = await listProducts();

    expect(products).toHaveLength(42);
    expect(products).toEqual(mockProducts);
  });

  it("returns stable unique identifiers and SKUs", async () => {
    const firstRead = await listProducts();
    const secondRead = await listProducts();

    expect(firstRead.map(({ id }) => id)).toEqual(
      secondRead.map(({ id }) => id),
    );
    expect(new Set(firstRead.map(({ id }) => id)).size).toBe(firstRead.length);
    expect(new Set(firstRead.map(({ sku }) => sku)).size).toBe(firstRead.length);
  });

  it("returns fresh records and cannot mutate the source fixture", async () => {
    const firstRead = await listProducts();
    const originalName = firstRead[0]?.name;

    expect(firstRead[0]).not.toBe(mockProducts[0]);
    if (firstRead[0]) firstRead[0].name = "Changed by a caller";

    const secondRead = await listProducts();
    expect(secondRead[0]?.name).toBe(originalName);
    expect(mockProducts[0]?.name).toBe(originalName);
  });

  it("returns JSON-serializable records with the documented field types", async () => {
    const products = await listProducts();
    const serialized = JSON.stringify(products);
    const parsed: unknown = JSON.parse(serialized);

    expect(parsed).toEqual(products);
    for (const product of products) {
      expect(typeof product.id).toBe("string");
      expect(typeof product.sku).toBe("string");
      expect(typeof product.name).toBe("string");
      expect(PRODUCT_CATEGORIES).toContain(product.category);
      expect(PRODUCT_UNITS).toContain(product.unit);
      expect(PRODUCT_STATUSES).toContain(product.status);
      expect(Number.isNaN(Date.parse(product.createdAt))).toBe(false);
    }
  });
});
