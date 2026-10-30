import type { z } from "zod";
import type { DatabaseProduct } from "@/server/db/schema/products";
import type { TenancyErrorCode } from "@/lib/tenancy/validation";
import type { productQuerySchema } from "./product.validation";

export type ProductListItem = Pick<
  DatabaseProduct,
  "id" | "sku" | "name" | "categoryCode" | "unitCode" | "status"
> & { createdAt: string; updatedAt: string };
export type ProductQuery = z.output<typeof productQuerySchema>;
export type ProductListResult = {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
  query: ProductQuery;
  contextVersion: number;
  canWrite: boolean;
  timezone: string;
};
export type ProductErrorCode =
  "INVALID_INPUT" | "NOT_FOUND" | "DUPLICATE_SKU" | "UNAVAILABLE";
export type ProductActionResult =
  | { ok: true; product: ProductListItem }
  | { ok: false; code: ProductErrorCode | TenancyErrorCode };
export type ProductsCatalogSuccess = {
  data: ProductListItem[];
  meta: Pick<ProductListResult, "total" | "page" | "pageSize" | "pageCount">;
};
