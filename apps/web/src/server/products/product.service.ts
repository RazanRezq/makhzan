import "server-only";

import { and, asc, count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/server/db";
import { products } from "@/server/db/schema";
import type { DatabaseProduct } from "@/server/db/schema/products";
import { hasPermission } from "@/lib/tenancy/permissions";
import type { TenantPermission } from "@/lib/tenancy/permissions";
import {
  parseProductQuery,
  productCreateSchema,
  productIdSchema,
  productStatusSchema,
  productUpdateSchema,
} from "@/lib/products/product.validation";
import type {
  ProductErrorCode,
  ProductListItem,
  ProductListResult,
} from "@/lib/products/catalog.types";
import {
  authenticatedSession,
  lockSession,
  lockedTenantContext,
  TenancyError,
  verifyMutationOrigin,
} from "@/server/tenants/security";
import type { TenantTransaction } from "@/server/tenants/security";

export class ProductError extends Error {
  constructor(public readonly code: ProductErrorCode) {
    super(code);
    this.name = "ProductError";
  }
}
function isDuplicateSku(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  if (
    "code" in error &&
    error.code === "23505" &&
    "constraint" in error &&
    error.constraint === "products_tenant_sku_unique"
  )
    return true;
  return (
    "cause" in error && error.cause !== error && isDuplicateSku(error.cause)
  );
}
function safeError(error: unknown): never {
  if (error instanceof TenancyError || error instanceof ProductError)
    throw error;
  if (error instanceof z.ZodError) throw new ProductError("INVALID_INPUT");
  if (isDuplicateSku(error)) throw new ProductError("DUPLICATE_SKU");
  throw new ProductError("UNAVAILABLE");
}
function present(row: DatabaseProduct): ProductListItem {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryCode: row.categoryCode,
    unitCode: row.unitCode,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
type ProductContext = Awaited<ReturnType<typeof lockedTenantContext>>;
async function authorizedOperation<T>(
  headers: Headers,
  permission: TenantPermission,
  operation: (tx: TenantTransaction, context: ProductContext) => Promise<T>,
  options: {
    mutation?: boolean;
    expectedVersion?: number;
    snapshot?: boolean;
  } = {},
): Promise<T> {
  try {
    const identity = await authenticatedSession(headers);
    if (options.mutation) verifyMutationOrigin(headers);
    return await db.transaction(
      async (tx) => {
        await lockSession(tx, identity);
        const context = await lockedTenantContext(tx, identity, permission, {
          expectedVersion: options.expectedVersion,
        });
        return operation(tx, context);
      },
      options.snapshot ? { isolationLevel: "repeatable read" } : undefined,
    );
  } catch (error) {
    return safeError(error);
  }
}
export async function listProducts(
  headers: Headers,
  input: unknown = {},
  expectedContextVersion?: number,
): Promise<ProductListResult> {
  return authorizedOperation(
    headers,
    "products.read",
    async (tx, context) => {
      const query = parseProductQuery(input);
      const pattern = `%${query.search.replace(/[\\%_]/g, "\\$&")}%`;
      const where = and(
        eq(products.tenantId, context.tenantId),
        query.search
          ? or(ilike(products.sku, pattern), ilike(products.name, pattern))
          : undefined,
        query.category ? eq(products.categoryCode, query.category) : undefined,
        query.status === "ALL" ? undefined : eq(products.status, query.status),
      );
      const [summary] = await tx
        .select({ total: count() })
        .from(products)
        .where(where);
      const total = summary!.total;
      const pageCount = Math.max(1, Math.ceil(total / query.pageSize));
      const page = Math.min(query.page, pageCount);
      const sortColumns = {
        sku: products.sku,
        name: products.name,
        createdAt: products.createdAt,
      };
      const primarySort = query.direction === "asc" ? asc : desc;
      // Match the existing DESC NULLS LAST index exactly. created_at is NOT NULL;
      // spelling out its index ordering avoids a needless PostgreSQL sort.
      const ordering =
        query.sort === "createdAt" && query.direction === "desc"
          ? sql`${products.createdAt} desc nulls last`
          : primarySort(sortColumns[query.sort]);
      const rows = await tx
        .select()
        .from(products)
        .where(where)
        .orderBy(ordering, asc(products.id))
        .limit(query.pageSize)
        .offset((page - 1) * query.pageSize);
      return {
        items: rows.map(present),
        total,
        page,
        pageSize: query.pageSize,
        pageCount,
        query: { ...query, page },
        contextVersion: context.version,
        canWrite: hasPermission(context.role, "products.write"),
        timezone: context.timezone,
      };
    },
    { snapshot: true, expectedVersion: expectedContextVersion },
  );
}
export async function getProductById(
  headers: Headers,
  input: unknown,
): Promise<ProductListItem> {
  return authorizedOperation(headers, "products.read", async (tx, context) => {
    const { id } = productIdSchema.parse(input);
    const [row] = await tx
      .select()
      .from(products)
      .where(and(eq(products.tenantId, context.tenantId), eq(products.id, id)))
      .limit(1);
    if (!row) throw new ProductError("NOT_FOUND");
    return present(row);
  });
}
export async function createProduct(
  headers: Headers,
  input: unknown,
): Promise<ProductListItem> {
  return authorizedOperation(
    headers,
    "products.write",
    async (tx, context) => {
      const { expectedVersion, ...fields } = productCreateSchema.parse(input);
      if (expectedVersion !== context.version)
        throw new TenancyError("STALE_CONTEXT");
      const [row] = await tx
        .insert(products)
        .values({ ...fields, tenantId: context.tenantId })
        .returning();
      return present(row!);
    },
    { mutation: true },
  );
}
export async function updateProduct(
  headers: Headers,
  input: unknown,
): Promise<ProductListItem> {
  return authorizedOperation(
    headers,
    "products.write",
    async (tx, context) => {
      const { id, expectedVersion, ...fields } =
        productUpdateSchema.parse(input);
      if (expectedVersion !== context.version)
        throw new TenancyError("STALE_CONTEXT");
      const [row] = await tx
        .update(products)
        .set(fields)
        .where(
          and(eq(products.tenantId, context.tenantId), eq(products.id, id)),
        )
        .returning();
      if (!row) throw new ProductError("NOT_FOUND");
      return present(row);
    },
    { mutation: true },
  );
}
async function setProductStatus(
  headers: Headers,
  input: unknown,
  status: DatabaseProduct["status"],
) {
  return authorizedOperation(
    headers,
    "products.write",
    async (tx, context) => {
      const { id, expectedVersion } = productStatusSchema.parse(input);
      if (expectedVersion !== context.version)
        throw new TenancyError("STALE_CONTEXT");
      const [row] = await tx
        .update(products)
        .set({ status })
        .where(
          and(eq(products.tenantId, context.tenantId), eq(products.id, id)),
        )
        .returning();
      if (!row) throw new ProductError("NOT_FOUND");
      return present(row);
    },
    { mutation: true },
  );
}
export async function archiveProduct(headers: Headers, input: unknown) {
  return setProductStatus(headers, input, "INACTIVE");
}
export async function reactivateProduct(headers: Headers, input: unknown) {
  return setProductStatus(headers, input, "ACTIVE");
}
