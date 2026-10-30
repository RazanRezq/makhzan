import { connection } from "next/server";
import { ProductError, listProducts } from "@/server/products/product.service";
import { TenancyError } from "@/server/tenants/security";
import { productQueryFromSearchParams } from "@/lib/products/product.validation";
import type { ProductsCatalogSuccess } from "@/lib/products/catalog.types";

const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(request: Request): Promise<Response> {
  await connection();

  try {
    const listing = await listProducts(
      request.headers,
      productQueryFromSearchParams(new URL(request.url).searchParams),
    );
    const response: ProductsCatalogSuccess = {
      data: listing.items,
      meta: {
        total: listing.total,
        page: listing.page,
        pageSize: listing.pageSize,
        pageCount: listing.pageCount,
      },
    };
    return Response.json(response, { headers: privateHeaders });
  } catch (error) {
    const code =
      error instanceof ProductError || error instanceof TenancyError
        ? error.code
        : "UNAVAILABLE";
    const status =
      code === "UNAUTHENTICATED"
        ? 401
        : code === "INVALID_INPUT"
          ? 400
          : ["FORBIDDEN", "NO_TENANT", "STALE_CONTEXT"].includes(code)
            ? 403
            : 500;
    const messages = {
      401: "Authentication is required.",
      403: "An active company membership is required.",
      400: "Invalid product query.",
      500: "Unable to load products.",
    };
    return Response.json(
      { error: { code, message: messages[status] } },
      { status, headers: privateHeaders },
    );
  }
}
