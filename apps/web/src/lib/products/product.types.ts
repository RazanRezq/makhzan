export const PRODUCT_CATEGORIES = [
  "BEVERAGES",
  "FOOD",
  "CLEANING",
  "PACKAGING",
  "OFFICE_SUPPLIES",
  "PERSONAL_CARE",
] as const;

export const PRODUCT_STATUSES = RESOURCE_STATUSES;

export const PRODUCT_UNITS = [
  "PIECE",
  "BOX",
  "BOTTLE",
  "PACK",
  "KILOGRAM",
  "LITER",
  "PAIR",
] as const;

export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
export type ProductUnit = (typeof PRODUCT_UNITS)[number];

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unit: ProductUnit;
  status: ProductStatus;
  createdAt: string;
};

export type ProductsApiSuccess = {
  data: Product[];
  meta: {
    count: number;
    source: "synthetic-demo";
  };
};

export type ProductsApiError = {
  error: {
    code: "DEMO_API_DISABLED" | "INTERNAL_ERROR" | "UNAUTHENTICATED";
    message: string;
  };
};

export type ProductsApiResponse = ProductsApiSuccess | ProductsApiError;
import { RESOURCE_STATUSES } from "@/lib/database/constants";
