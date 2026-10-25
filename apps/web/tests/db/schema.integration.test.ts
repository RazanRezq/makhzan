import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  normalizeCategoryCode,
  normalizeSku,
  normalizeUnitCode,
} from "@/lib/products/product-codes";
import { products, tenants, warehouses } from "@/server/db/schema";
import * as schema from "@/server/db/schema";

type PostgresErrorDetails = {
  code?: string;
  constraint?: string;
};

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "../..");
const migrationsFolder = path.join(webRoot, "drizzle");

function requireSafeTestDatabaseUrl(value: string | undefined) {
  if (process.env.NODE_ENV !== "test" || !value) {
    throw new Error("Database tests require NODE_ENV=test and TEST_DATABASE_URL.");
  }

  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const allowedHosts = new Set(["127.0.0.1", "localhost", "postgres-test"]);
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    databaseName !== "makhzan_test" ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error(
      "Refusing to reset a database that is not the isolated Makhzan test database.",
    );
  }

  return value;
}

function readPostgresError(error: unknown): PostgresErrorDetails {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (typeof current !== "object" || current === null) return {};
    const record = current as Record<string, unknown>;
    if (typeof record.code === "string") {
      return {
        code: record.code,
        constraint:
          typeof record.constraint === "string" ? record.constraint : undefined,
      };
    }
    current = record.cause;
  }
  return {};
}

async function expectPostgresError(
  operation: () => Promise<unknown>,
  code: string,
  constraint?: string,
) {
  let caught: unknown;
  try {
    await operation();
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeDefined();
  const details = readPostgresError(caught);
  expect(details.code).toBe(code);
  if (constraint) expect(details.constraint).toBe(constraint);
}

const testDatabaseUrl = requireSafeTestDatabaseUrl(
  process.env.TEST_DATABASE_URL,
);
const pool = new Pool({ connectionString: testDatabaseUrl, max: 6 });
const database = drizzle({ client: pool, schema });

async function createTenant(name: string) {
  const [tenant] = await database
    .insert(tenants)
    .values({ name, baseCurrency: "AED" })
    .returning();
  if (!tenant) throw new Error("Tenant insert returned no row.");
  return tenant;
}

async function createProduct(tenantId: string, sku: string) {
  const [product] = await database
    .insert(products)
    .values({
      tenantId,
      sku,
      name: `Product ${sku}`,
      categoryCode: "GENERAL",
      unitCode: "PIECE",
    })
    .returning();
  if (!product) throw new Error("Product insert returned no row.");
  return product;
}

beforeAll(async () => {
  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await migrate(database, { migrationsFolder });
});

beforeEach(async () => {
  await pool.query("truncate table products, warehouses, tenants cascade");
});

afterAll(async () => {
  await pool.end();
});

describe("database migrations", () => {
  it("applies the complete schema, constraints, indexes, and triggers", async () => {
    const tables = await pool.query<{ table_name: string }>(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
       order by table_name`,
    );
    expect(tables.rows.map(({ table_name }) => table_name)).toEqual([
      "account",
      "products",
      "rate_limit",
      "session",
      "tenants",
      "user",
      "verification",
      "warehouses",
    ]);

    const constraints = await pool.query<{ conname: string }>(
      `select conname
       from pg_constraint
       where connamespace = 'public'::regnamespace`,
    );
    const constraintNames = new Set(constraints.rows.map(({ conname }) => conname));
    expect([...constraintNames]).toEqual(
      expect.arrayContaining([
        "products_tenant_sku_unique",
        "products_tenant_id_unique",
        "products_tenant_id_tenants_id_fk",
        "session_token_unique",
        "session_user_id_user_id_fk",
        "account_user_id_user_id_fk",
        "user_email_unique",
        "warehouses_tenant_code_unique",
        "warehouses_tenant_id_unique",
        "warehouses_tenant_id_tenants_id_fk",
      ]),
    );

    const indexes = await pool.query<{ indexname: string }>(
      `select indexname from pg_indexes where schemaname = 'public'`,
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "products_tenant_created_at_idx",
        "tenants_status_created_at_idx",
        "warehouses_tenant_name_idx",
      ]),
    );

    const triggers = await pool.query<{ trigger_name: string }>(
      `select trigger_name
       from information_schema.triggers
       where trigger_schema = 'public'
       order by trigger_name`,
    );
    expect(triggers.rows.map(({ trigger_name }) => trigger_name)).toEqual([
      "products_set_updated_at",
      "tenants_set_updated_at",
      "warehouses_set_updated_at",
    ]);
  });
});

describe("tenant and catalog integrity", () => {
  it("creates tenants with database-generated identifiers and defaults", async () => {
    const tenant = await createTenant("Northwind Trading");

    expect(tenant.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(tenant.status).toBe("ACTIVE");
    expect(tenant.timezone).toBe("Asia/Dubai");
    expect(tenant.createdAt).toBeInstanceOf(Date);
    expect(tenant.updatedAt).toEqual(tenant.createdAt);
  });

  it("rejects products that omit required fields", async () => {
    const tenant = await createTenant("Required Fields Tenant");

    await expectPostgresError(
      () =>
        pool.query(
          `insert into products (tenant_id, sku, category_code, unit_code)
           values ($1, $2, $3, $4)`,
          [tenant.id, "REQ-001", "GENERAL", "PIECE"],
        ),
      "23502",
    );
  });

  it("rejects duplicate SKUs within one tenant", async () => {
    const tenant = await createTenant("Duplicate SKU Tenant");
    await createProduct(tenant.id, "DUP-001");

    await expectPostgresError(
      () => createProduct(tenant.id, "DUP-001"),
      "23505",
      "products_tenant_sku_unique",
    );
  });

  it("allows the same canonical SKU in separate tenants", async () => {
    const tenantA = await createTenant("Tenant A");
    const tenantB = await createTenant("Tenant B");

    const productA = await createProduct(tenantA.id, "SHARED-001");
    const productB = await createProduct(tenantB.id, "SHARED-001");

    expect(productA.tenantId).not.toBe(productB.tenantId);
    expect(productA.sku).toBe(productB.sku);
  });

  it("enforces tenant foreign keys and restricts deletion of referenced tenants", async () => {
    await expectPostgresError(
      () => createProduct(randomUUID(), "INVALID-TENANT"),
      "23503",
      "products_tenant_id_tenants_id_fk",
    );

    const tenant = await createTenant("Referenced Tenant");
    await createProduct(tenant.id, "REFERENCED-001");
    await expectPostgresError(
      () => database.delete(tenants).where(eq(tenants.id, tenant.id)),
      "23503",
    );
  });

  it("enforces tenant-scoped warehouse codes", async () => {
    const tenantA = await createTenant("Warehouse Tenant A");
    const tenantB = await createTenant("Warehouse Tenant B");
    const values = { code: "DXB-01", name: "Dubai Warehouse" };

    await database.insert(warehouses).values({ tenantId: tenantA.id, ...values });
    await expectPostgresError(
      () => database.insert(warehouses).values({ tenantId: tenantA.id, ...values }),
      "23505",
      "warehouses_tenant_code_unique",
    );
    await expect(
      database.insert(warehouses).values({ tenantId: tenantB.id, ...values }),
    ).resolves.toBeDefined();
  });

  it("returns only products belonging to the requested tenant", async () => {
    const tenantA = await createTenant("Query Tenant A");
    const tenantB = await createTenant("Query Tenant B");
    await createProduct(tenantA.id, "TENANT-A-001");
    await createProduct(tenantB.id, "TENANT-B-001");

    const tenantAProducts = await database
      .select()
      .from(products)
      .where(eq(products.tenantId, tenantA.id));

    expect(tenantAProducts.map(({ sku }) => sku)).toEqual(["TENANT-A-001"]);
  });

  it("accepts extensible category and unit codes but rejects noncanonical codes", async () => {
    const tenant = await createTenant("Custom Codes Tenant");
    const categoryCode = normalizeCategoryCode(" raw_materials ");
    const unitCode = normalizeUnitCode(" carton_24 ");
    expect(categoryCode).toBe("RAW_MATERIALS");
    expect(unitCode).toBe("CARTON_24");
    await expect(
      database.insert(products).values({
        tenantId: tenant.id,
        sku: "CUSTOM-001",
        name: "Custom Product",
        categoryCode,
        unitCode,
      }),
    ).resolves.toBeDefined();

    await expectPostgresError(
      () =>
        pool.query(
          `insert into products
             (tenant_id, sku, name, category_code, unit_code)
           values ($1, $2, $3, $4, $5)`,
          [tenant.id, "CUSTOM-002", "Invalid Codes", "raw materials", "box"],
        ),
      "23514",
      "products_category_code_check",
    );
  });
});

describe("canonical SKU behavior", () => {
  it("normalizes compatibility characters and prevents normalized collisions", async () => {
    const tenant = await createTenant("Canonical SKU Tenant");
    const normalized = normalizeSku("  \uFF21\uFF22\uFF23\uFF0D\uFF11\uFF12\uFF13\tbox #\uFF11\uFF12  ");
    expect(normalized).toBe("ABC-123 BOX #12");
    await createProduct(tenant.id, normalized);

    const colliding = normalizeSku("abc-123   box #12");
    await expectPostgresError(
      () => createProduct(tenant.id, colliding),
      "23505",
      "products_tenant_sku_unique",
    );
  });

  it("rejects direct noncanonical and non-ASCII SKU writes", async () => {
    const tenant = await createTenant("Rejected SKU Tenant");

    await expectPostgresError(
      () => createProduct(tenant.id, "lowercase-001"),
      "23514",
      "products_sku_canonical_check",
    );
    await expectPostgresError(
      () => createProduct(tenant.id, "\u0645\u062E\u0632\u0646-001"),
      "23514",
      "products_sku_canonical_check",
    );
  });
});

describe("updated_at trigger behavior", () => {
  it("uses wall-clock time, preserves created_at, and never moves updated_at backwards", async () => {
    const tenant = await createTenant("Timestamp Tenant");
    const transactionClient = await pool.connect();
    let committed = false;

    try {
      await transactionClient.query("begin");
      const started = await transactionClient.query<{ started_at: Date }>(
        "select now() as started_at",
      );
      await transactionClient.query("select pg_sleep(0.02)");
      const firstUpdate = await transactionClient.query<{
        created_at: Date;
        updated_at: Date;
      }>(
        `update tenants
         set name = $1, created_at = $2, updated_at = $2
         where id = $3
         returning created_at, updated_at`,
        ["Timestamp Tenant Updated", new Date("2000-01-01T00:00:00.000Z"), tenant.id],
      );
      await transactionClient.query("commit");
      committed = true;

      const first = firstUpdate.rows[0];
      const transactionStart = started.rows[0]?.started_at;
      expect(first).toBeDefined();
      expect(transactionStart).toBeDefined();
      expect(first?.created_at).toEqual(tenant.createdAt);
      expect(first?.updated_at.getTime()).toBeGreaterThan(
        transactionStart?.getTime() ?? Number.POSITIVE_INFINITY,
      );

      await pool.query("select pg_sleep(0.01)");
      const secondUpdate = await pool.query<{ created_at: Date; updated_at: Date }>(
        `update tenants
         set name = $1, updated_at = $2
         where id = $3
         returning created_at, updated_at`,
        ["Timestamp Tenant Updated Again", new Date("1999-01-01T00:00:00.000Z"), tenant.id],
      );
      const second = secondUpdate.rows[0];
      expect(second?.created_at).toEqual(tenant.createdAt);
      expect(second?.updated_at.getTime()).toBeGreaterThanOrEqual(
        first?.updated_at.getTime() ?? Number.POSITIVE_INFINITY,
      );
    } finally {
      if (!committed) await transactionClient.query("rollback");
      transactionClient.release();
    }
  });

  it("keeps timestamps monotonic across concurrent updates", async () => {
    const tenant = await createTenant("Concurrent Timestamp Tenant");

    const updates = await Promise.all([
      pool.query<{ created_at: Date; updated_at: Date }>(
        `update tenants set name = $1 where id = $2 returning created_at, updated_at`,
        ["Concurrent Update A", tenant.id],
      ),
      pool.query<{ created_at: Date; updated_at: Date }>(
        `update tenants set name = $1 where id = $2 returning created_at, updated_at`,
        ["Concurrent Update B", tenant.id],
      ),
    ]);
    const returnedRows = updates.flatMap(({ rows }) => rows);
    const finalRow = await pool.query<{ created_at: Date; updated_at: Date }>(
      `select created_at, updated_at from tenants where id = $1`,
      [tenant.id],
    );

    expect(returnedRows).toHaveLength(2);
    expect(returnedRows.every(({ created_at }) => created_at.getTime() === tenant.createdAt.getTime())).toBe(
      true,
    );
    expect(finalRow.rows[0]?.updated_at.getTime()).toBeGreaterThanOrEqual(
      Math.max(...returnedRows.map(({ updated_at }) => updated_at.getTime())),
    );
  });
});
