import "server-only";
import type { Product } from "@/lib/products/product.types";
import { mockProducts } from "./mock-products";

// Isolated synthetic fixture helper; not imported by the application or APIs.
export function listDemoProducts(): Product[] {
  return mockProducts.map((product) => ({ ...product }));
}
