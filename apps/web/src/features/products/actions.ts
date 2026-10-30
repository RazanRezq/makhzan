"use server";

import { headers } from "next/headers";
import { refresh } from "next/cache";
import {
  archiveProduct,
  createProduct,
  ProductError,
  reactivateProduct,
  updateProduct,
} from "@/server/products/product.service";
import { TenancyError } from "@/server/tenants/security";
import type {
  ProductActionResult,
  ProductListItem,
} from "@/lib/products/catalog.types";

async function mutate(
  operation: (headers: Headers, input: unknown) => Promise<ProductListItem>,
  input: unknown,
): Promise<ProductActionResult> {
  try {
    const product = await operation(await headers(), input);
    refresh();
    return { ok: true, product };
  } catch (error) {
    return {
      ok: false,
      code:
        error instanceof ProductError || error instanceof TenancyError
          ? error.code
          : "UNAVAILABLE",
    };
  }
}
export async function createProductAction(input: unknown) {
  return mutate(createProduct, input);
}
export async function updateProductAction(input: unknown) {
  return mutate(updateProduct, input);
}
export async function archiveProductAction(input: unknown) {
  return mutate(archiveProduct, input);
}
export async function reactivateProductAction(input: unknown) {
  return mutate(reactivateProduct, input);
}
