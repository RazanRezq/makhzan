import "server-only";

import type { Product } from "@/lib/products/product.types";
import { mockProducts } from "./mock-products";

export async function listProducts(): Promise<Product[]> {
  return mockProducts.map((product) => ({ ...product }));
}
