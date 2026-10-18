import { connection } from "next/server";
import type {
  ProductsApiError,
  ProductsApiSuccess,
} from "@/lib/products/product.types";
import { listProducts } from "@/server/products/product.service";

function isDemoApiEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEMO_PRODUCTS_API === "true"
  );
}

export async function GET(): Promise<Response> {
  await connection();

  if (!isDemoApiEnabled()) {
    const response: ProductsApiError = {
      error: {
        code: "DEMO_API_DISABLED",
        message: "The synthetic products API is disabled.",
      },
    };
    return Response.json(response, {
      status: 404,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const products = await listProducts();
    const response: ProductsApiSuccess = {
      data: products,
      meta: { count: products.length, source: "synthetic-demo" },
    };
    return Response.json(response, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    const response: ProductsApiError = {
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to load synthetic products.",
      },
    };
    return Response.json(response, {
      status: 500,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
