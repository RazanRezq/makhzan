import { connection } from "next/server";
import type {
  ProductsApiError,
  ProductsApiSuccess,
} from "@/lib/products/product.types";
import { authorizeTenant, TenancyError } from "@/server/tenants/security";
import { listProducts } from "@/server/products/product.service";

function isDemoApiEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.ENABLE_DEMO_PRODUCTS_API === "true"
  );
}

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    await authorizeTenant(request.headers, "demoProducts.read");
  } catch (error) {
    const unauthenticated = error instanceof TenancyError && error.code === "UNAUTHENTICATED";
    const unavailable = !(error instanceof TenancyError);
    const response: ProductsApiError = {
      error: {
        code: unauthenticated ? "UNAUTHENTICATED" : unavailable ? "INTERNAL_ERROR" : "FORBIDDEN",
        message: unauthenticated ? "Authentication is required." : unavailable ? "Unable to load synthetic products." : "An active company membership is required.",
      },
    };
    return Response.json(response, {
      status: unauthenticated ? 401 : unavailable ? 500 : 403,
      headers: { "Cache-Control": "no-store" },
    });
  }

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
