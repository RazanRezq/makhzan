import { describe, expect, it } from "vitest";
import {
  parseProductQuery,
  productCreateSchema,
  productFieldsSchema,
  productQueryFromSearchParams,
  productStatusSchema,
} from "./product.validation";

describe("database product validation", () => {
  const fields = {
    sku: "  ａｂｃ  001 ",
    name: "  منتج تجريبي ",
    categoryCode: "custom.category",
    unitCode: "kg",
  };
  it("reuses deterministic code normalization without limiting category/unit values to fixtures", () => {
    expect(productFieldsSchema.parse(fields)).toEqual({
      sku: "ABC 001",
      name: "منتج تجريبي",
      categoryCode: "CUSTOM.CATEGORY",
      unitCode: "KG",
    });
  });
  it.each([
    { sku: "مخزن" },
    { sku: "\u0000" },
    { categoryCode: "bad category" },
    { unitCode: "bad unit" },
    { name: " " },
  ])("safely rejects invalid product fields %j", (change) => {
    expect(
      productFieldsSchema.safeParse({ ...fields, ...change }).success,
    ).toBe(false);
  });
  it.each([
    "tenantId",
    "tenant_id",
    "id",
    "status",
    "role",
    "createdAt",
    "updatedAt",
  ])("rejects injected immutable/privileged create field %s", (key) => {
    expect(
      productCreateSchema.safeParse({
        ...fields,
        expectedVersion: 1,
        [key]: "forged",
      }).success,
    ).toBe(false);
  });
  it("requires a valid active-context version on writes", () => {
    expect(productCreateSchema.safeParse(fields).success).toBe(false);
    expect(
      productCreateSchema.safeParse({ ...fields, expectedVersion: 0 }).success,
    ).toBe(false);
    expect(
      productStatusSchema.safeParse({ id: "not-a-uuid", expectedVersion: 1 })
        .success,
    ).toBe(false);
  });
  it("uses bounded, allowlisted, normalized query defaults", () => {
    expect(parseProductQuery()).toEqual({
      search: "",
      category: "",
      status: "ALL",
      sort: "createdAt",
      direction: "desc",
      page: 1,
      pageSize: 25,
    });
    expect(
      parseProductQuery({
        search: " test ",
        category: "custom",
        page: "2",
        pageSize: "50",
      }),
    ).toMatchObject({
      search: "test",
      category: "CUSTOM",
      page: 2,
      pageSize: 50,
    });
  });
  it.each([
    { pageSize: "101" },
    { pageSize: 1 },
    { page: "-1" },
    { page: "1.5" },
    { page: "1e4" },
    { sort: "tenant_id" },
    { direction: "desc;drop" },
    { tenantId: "forged" },
    { status: "ARCHIVED" },
    { search: ["a", "b"] },
    { search: "x\u0000y" },
  ])("rejects malformed or forged list query %j", (input) =>
    expect(() => parseProductQuery(input)).toThrow(),
  );
  it("does not silently discard repeated URL parameters", () => {
    const input = productQueryFromSearchParams(
      new URLSearchParams("page=1&page=2"),
    );
    expect(input).toEqual({ page: ["1", "2"] });
    expect(() => parseProductQuery(input)).toThrow();
  });
  it.each([
    "__proto__=forged",
    "__proto__=a&__proto__=b",
    "constructor=forged",
  ])("keeps special URL keys visible for strict rejection (%s)", (query) => {
    const values = productQueryFromSearchParams(new URLSearchParams(query));
    expect(Object.keys(values)).toHaveLength(1);
    expect(() => parseProductQuery(values)).toThrow();
    expect(Object.getPrototypeOf(values)).toBe(Object.prototype);
  });
});
