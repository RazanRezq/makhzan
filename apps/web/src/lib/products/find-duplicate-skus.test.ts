import { describe, expect, it } from "vitest";
import { findDuplicateSkus } from "./find-duplicate-skus";

describe("findDuplicateSkus", () => {
  it("returns no duplicates for empty and unique inputs", () => {
    expect(findDuplicateSkus([])).toEqual([]);
    expect(findDuplicateSkus([{ sku: "A-1" }, { sku: "B-2" }])).toEqual([]);
  });

  it("matches SKUs without case or surrounding-whitespace sensitivity", () => {
    expect(
      findDuplicateSkus([
        { sku: " bev-wat-001 " },
        { sku: "FOOD-2" },
        { sku: "BEV-WAT-001" },
        { sku: " food-2 " },
      ]),
    ).toEqual(["BEV-WAT-001", "FOOD-2"]);
  });

  it("reports a repeatedly duplicated SKU once in deterministic order", () => {
    expect(
      findDuplicateSkus([
        { sku: "A" },
        { sku: "B" },
        { sku: "B" },
        { sku: "A" },
        { sku: "A" },
        { sku: "B" },
      ]),
    ).toEqual(["B", "A"]);
  });

  it("treats repeated blank normalized values consistently", () => {
    expect(findDuplicateSkus([{ sku: " " }, { sku: "" }])).toEqual([""]);
  });

  it("does not modify input records or their ordering", () => {
    const products = Object.freeze([
      Object.freeze({ sku: " b-2 " }),
      Object.freeze({ sku: "B-2" }),
    ]);

    expect(findDuplicateSkus(products)).toEqual(["B-2"]);
    expect(products).toEqual([{ sku: " b-2 " }, { sku: "B-2" }]);
  });
});
