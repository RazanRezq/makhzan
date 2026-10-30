import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TenantRole } from "@/lib/tenancy/permissions";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl || process.env.NODE_ENV !== "test") {
  throw new Error("Products integration tests require NODE_ENV=test and TEST_DATABASE_URL.");
}
const parsedUrl = new URL(testDatabaseUrl);
if (
  !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
  !["localhost", "127.0.0.1", "postgres-test"].includes(parsedUrl.hostname) ||
  decodeURIComponent(parsedUrl.pathname.slice(1)) !== "makhzan_test"
) {
  throw new Error("Refusing to reset a database outside the isolated Products test scope.");
}

const BASE = "http://products.test.local";
const PASSWORD = "Synthetic-Products-Password-42!";
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = "synthetic-products-secret-at-least-32-characters";
process.env.BETTER_AUTH_URL = BASE;
process.env.AUTH_TRUSTED_ORIGINS = BASE;

const pool = new Pool({ connectionString: testDatabaseUrl, max: 8 });
const database = drizzle(pool);
const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);
let auth: typeof import("@/server/auth/auth").auth;
let appPool: typeof import("@/server/db").databasePool;
let catalog: typeof import("@/server/products/product.service");
let selectCompany: typeof import("@/server/tenants/context.service").selectCompany;
const roles = ["OWNER", "MANAGER", "STAFF", "VIEWER"] as const;
type Person = { id: string; email: string; role: TenantRole; headers: Headers; sessionId: string };
const people: Person[] = [];
let tenantA: string;
let tenantB: string;

function owner() {
  return people[0]!;
}

function input(change: Record<string, unknown> = {}) {
  return {
    sku: "SKU-001",
    name: "Test Product",
    categoryCode: "GENERAL",
    unitCode: "UNIT",
    expectedVersion: 1,
    ...change,
  };
}

async function authPost(endpoint: string, body: object) {
  return auth.handler(new Request(`${BASE}/api/auth/${endpoint}`, {
    method: "POST",
    headers: { Origin: BASE, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }));
}

async function insertProduct(
  tenantId = tenantA,
  fields: { sku?: string; name?: string; category?: string; status?: "ACTIVE" | "INACTIVE" } = {},
) {
  const result = await pool.query<{ id: string }>(
    "insert into products(tenant_id,sku,name,category_code,unit_code,status) values ($1,$2,$3,$4,'UNIT',$5) returning id",
    [tenantId, fields.sku ?? "DB-PRODUCT", fields.name ?? "Existing Product", fields.category ?? "GENERAL", fields.status ?? "ACTIVE"],
  );
  return result.rows[0]!.id;
}

async function productRows(tenantId = tenantA) {
  return (await pool.query("select * from products where tenant_id=$1 order by id", [tenantId])).rows;
}

beforeAll(async () => {
  await pool.query("drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public");
  await migrate(database, { migrationsFolder });
  ({ auth } = await import("@/server/auth/auth"));
  ({ databasePool: appPool } = await import("@/server/db"));
  catalog = await import("@/server/products/product.service");
  ({ selectCompany } = await import("@/server/tenants/context.service"));
  for (const role of roles) {
    const email = `products-${role.toLowerCase()}@example.test`;
    const registration = await authPost("sign-up/email", { name: `Products ${role}`, email, password: PASSWORD });
    expect(registration.status).toBe(200);
    const identity = await pool.query<{ id: string }>('select id from "user" where email=$1', [email]);
    people.push({ id: identity.rows[0]!.id, email, role, headers: new Headers(), sessionId: "" });
  }
});

beforeEach(async () => {
  await pool.query('truncate tenants, tenant_creation_rate_limits, "session", rate_limit cascade');
  const companies = await pool.query<{ id: string }>(
    "insert into tenants(name,base_currency) values ('Products tenant A','AED'),('Products tenant B','TRY') returning id",
  );
  [tenantA, tenantB] = companies.rows.map(({ id }) => id) as [string, string];
  for (const person of people) {
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,$3)", [tenantA, person.id, person.role]);
    const login = await authPost("sign-in/email", { email: person.email, password: PASSWORD });
    expect(login.status).toBe(200);
    const cookie = login.headers.getSetCookie().map((value) => value.split(";", 1)[0]).join("; ");
    person.headers = new Headers({ Cookie: cookie, Origin: BASE });
    const session = await pool.query<{ id: string }>('select id from "session" where user_id=$1', [person.id]);
    person.sessionId = session.rows[0]!.id;
    await selectCompany(person.headers, { tenantId: tenantA, expectedVersion: 0 });
  }
  // Tenant B has its own membership and is never selected merely from a Product ID.
  await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'OWNER')", [tenantB, people[1]!.id]);
});

afterAll(async () => {
  await appPool?.end();
  await pool.end();
});

describe("Products persistence and integrity", () => {
  it("starts a company with an empty catalog rather than synthetic records", async () => {
    const result = await catalog.listProducts(owner().headers);
    expect(result).toMatchObject({ items: [], total: 0, page: 1, pageSize: 25, pageCount: 1 });
    expect(JSON.stringify(result)).not.toContain("synthetic-demo");
  });

  it("creates normalized canonical identifiers and returns only safe typed fields", async () => {
    const product = await catalog.createProduct(owner().headers, input({
      sku: "  ａｂｃ\t１２３  ", name: "  Real Product  ", categoryCode: " general/custom ", unitCode: " kg ",
    }));
    expect(product).toMatchObject({ sku: "ABC 123", name: "Real Product", categoryCode: "GENERAL/CUSTOM", unitCode: "KG", status: "ACTIVE" });
    expect(product.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(product.createdAt).toISOString()).toBe(product.createdAt);
    expect(new Date(product.updatedAt).toISOString()).toBe(product.updatedAt);
    expect(product).not.toHaveProperty("tenantId");
    expect(Object.keys(product).sort()).toEqual(["categoryCode", "createdAt", "id", "name", "sku", "status", "unitCode", "updatedAt"].sort());
    const rows = await productRows();
    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantA);
  });

  it("rejects duplicate SKU within the same tenant without leaking a database error", async () => {
    await catalog.createProduct(owner().headers, input());
    await expect(catalog.createProduct(owner().headers, input())).rejects.toMatchObject({ code: "DUPLICATE_SKU" });
    expect(await productRows()).toHaveLength(1);
    try {
      await catalog.createProduct(owner().headers, input());
      throw new Error("Expected duplicate SKU rejection.");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(error).toMatchObject({ code: "DUPLICATE_SKU" });
      const message = (error as Error).message;
      expect(message).not.toMatch(/23505|insert into|products_tenant_sku_unique|postgresql:\/\//i);
    }
  });

  it("allows the same canonical SKU in another authorized tenant", async () => {
    await catalog.createProduct(owner().headers, input());
    await selectCompany(people[1]!.headers, { tenantId: tenantB, expectedVersion: 1 });
    const other = await catalog.createProduct(people[1]!.headers, input({ expectedVersion: 2 }));
    expect(other.sku).toBe("SKU-001");
    expect(await productRows(tenantA)).toHaveLength(1);
    expect(await productRows(tenantB)).toHaveLength(1);
  });

  it.each([
    ["sku-a", "ＳＫＵ-A"],
    ["a\tb", " A  B "],
    ["ß-01", "SS-01"],
  ])("rejects normalization collisions between %s and %s", async (original, duplicate) => {
    await catalog.createProduct(owner().headers, input({ sku: original }));
    await expect(catalog.createProduct(owner().headers, input({ sku: duplicate }))).rejects.toMatchObject({ code: "DUPLICATE_SKU" });
  });

  it.each([
    { name: " " }, { sku: "" }, { sku: "عربي" }, { sku: "X\0Y" },
    { categoryCode: "TWO WORDS" }, { unitCode: "!BAD" },
    { sku: "X".repeat(65) }, { categoryCode: "X".repeat(65) }, { unitCode: "X".repeat(33) },
    { expectedVersion: "1" },
  ])("rejects invalid product fields before persistence (%j)", async (change) => {
    await expect(catalog.createProduct(owner().headers, input(change))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(await productRows()).toHaveLength(0);
  });

  it.each([
    { tenantId: "client-company" }, { tenant_id: "client-company" }, { id: randomUUID() },
    { status: "INACTIVE" }, { createdAt: "2026-01-01" }, { updatedAt: "2026-01-01" },
  ])("rejects client ownership/lifecycle/timestamp injection (%j)", async (change) => {
    await expect(catalog.createProduct(owner().headers, input(change))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("updates product fields without changing its ID or tenant ownership", async () => {
    const product = await catalog.createProduct(owner().headers, input());
    const updated = await catalog.updateProduct(owner().headers, { ...input({ sku: " changed-1 ", name: "Changed", categoryCode: "FOOD", unitCode: "BOX" }), id: product.id });
    expect(updated).toMatchObject({ id: product.id, sku: "CHANGED-1", name: "Changed", categoryCode: "FOOD", unitCode: "BOX", status: "ACTIVE", createdAt: product.createdAt });
    expect(new Date(updated.updatedAt).getTime()).toBeGreaterThanOrEqual(new Date(product.updatedAt).getTime());
    expect((await productRows())[0].tenant_id).toBe(tenantA);
  });

  it("rejects a duplicate SKU update and preserves the previous product fields", async () => {
    await catalog.createProduct(owner().headers, input());
    const other = await catalog.createProduct(owner().headers, input({ sku: "SKU-002", name: "Unchanged" }));
    await expect(catalog.updateProduct(owner().headers, { ...input(), id: other.id })).rejects.toMatchObject({ code: "DUPLICATE_SKU" });
    expect(await catalog.getProductById(owner().headers, { id: other.id })).toMatchObject({ sku: "SKU-002", name: "Unchanged" });
  });

  it("archives and reactivates without hard deletion", async () => {
    const product = await catalog.createProduct(owner().headers, input());
    const archived = await catalog.archiveProduct(owner().headers, { id: product.id, expectedVersion: 1 });
    expect(archived.status).toBe("INACTIVE");
    expect(await catalog.getProductById(people[3]!.headers, { id: product.id })).toMatchObject({ id: product.id, status: "INACTIVE" });
    const restored = await catalog.reactivateProduct(owner().headers, { id: product.id, expectedVersion: 1 });
    expect(restored).toMatchObject({ id: product.id, status: "ACTIVE", createdAt: product.createdAt });
    expect(await productRows()).toHaveLength(1);
  });

  it("uses the PostgreSQL timestamp trigger automatically on updates", async () => {
    const seeded = await pool.query<{ id: string; created_at: Date }>(
      "insert into products(tenant_id,sku,name,category_code,unit_code,created_at,updated_at) values ($1,'OLD-TIMESTAMP','Old','GENERAL','UNIT','2025-01-01T00:00:00Z','2025-01-01T00:00:00Z') returning id,created_at",
      [tenantA],
    );
    const product = await catalog.updateProduct(owner().headers, { ...input({ sku: "OLD-TIMESTAMP", name: "Changed" }), id: seeded.rows[0]!.id });
    expect(product.createdAt).toBe(seeded.rows[0]!.created_at.toISOString());
    expect(new Date(product.updatedAt).getTime()).toBeGreaterThan(Date.parse("2025-01-01T00:00:00Z"));
  });

  it("allows only one concurrent creation of the same tenant SKU", async () => {
    const results = await Promise.allSettled(Array.from({ length: 4 }, () => catalog.createProduct(owner().headers, input())));
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
    for (const result of results) {
      if (result.status === "rejected") expect(result.reason).toMatchObject({ code: "DUPLICATE_SKU" });
    }
    expect(await productRows()).toHaveLength(1);
  });
});

describe("Products authorization and tenant isolation", () => {
  it.each(roles)("allows %s to read with the correct write capability", async (role) => {
    const person = people.find((candidate) => candidate.role === role)!;
    const id = await insertProduct();
    const listing = await catalog.listProducts(person.headers);
    expect(listing.items.map((product) => product.id)).toEqual([id]);
    expect(listing.canWrite).toBe(role === "OWNER" || role === "MANAGER");
    expect(listing.contextVersion).toBe(1);
    expect(listing.timezone).toBe("Asia/Dubai");
    expect(await catalog.getProductById(person.headers, { id })).toMatchObject({ id });
  });

  it.each(["OWNER", "MANAGER"] as const)("allows %s lifecycle mutations", async (role) => {
    const person = people.find((candidate) => candidate.role === role)!;
    const product = await catalog.createProduct(person.headers, input());
    await expect(catalog.updateProduct(person.headers, { ...input({ name: "Updated" }), id: product.id })).resolves.toMatchObject({ name: "Updated" });
    await expect(catalog.archiveProduct(person.headers, { id: product.id, expectedVersion: 1 })).resolves.toMatchObject({ status: "INACTIVE" });
    await expect(catalog.reactivateProduct(person.headers, { id: product.id, expectedVersion: 1 })).resolves.toMatchObject({ status: "ACTIVE" });
  });

  it.each(["STAFF", "VIEWER"] as const)("rejects every %s write independently of UI controls", async (role) => {
    const person = people.find((candidate) => candidate.role === role)!;
    const id = await insertProduct();
    const before = await productRows();
    const operations = [
      () => catalog.createProduct(person.headers, input()),
      () => catalog.updateProduct(person.headers, { ...input(), id }),
      () => catalog.archiveProduct(person.headers, { id, expectedVersion: 1 }),
      () => catalog.reactivateProduct(person.headers, { id, expectedVersion: 1 }),
    ];
    for (const operation of operations) await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await productRows()).toEqual(before);
  });

  it("rejects unauthenticated and forged sessions for reads and writes", async () => {
    for (const headers of [new Headers(), new Headers({ Cookie: "makhzan.session_token=forged", Origin: BASE })]) {
      await expect(catalog.listProducts(headers)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
      await expect(catalog.createProduct(headers, input())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    }
  });

  it.each([undefined, "https://hostile.example"])("requires a trusted Origin on every mutation (%s)", async (origin) => {
    const id = await insertProduct();
    const headers = new Headers(owner().headers);
    if (origin) headers.set("Origin", origin);
    else headers.delete("Origin");
    const operations = [
      () => catalog.createProduct(headers, input()),
      () => catalog.updateProduct(headers, { ...input(), id }),
      () => catalog.archiveProduct(headers, { id, expectedVersion: 1 }),
      () => catalog.reactivateProduct(headers, { id, expectedVersion: 1 }),
    ];
    for (const operation of operations) await expect(operation()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns the same safe not-found error for missing and foreign-tenant products", async () => {
    const foreignId = await insertProduct(tenantB, { name: "Never disclose this foreign product" });
    for (const id of [randomUUID(), foreignId]) {
      await expect(catalog.getProductById(owner().headers, { id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(catalog.updateProduct(owner().headers, { ...input(), id })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(catalog.archiveProduct(owner().headers, { id, expectedVersion: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(catalog.reactivateProduct(owner().headers, { id, expectedVersion: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect((await catalog.listProducts(owner().headers)).total).toBe(0);
    expect(await productRows(tenantB)).toHaveLength(1);
  });

  it.each(["membership", "tenant"])("immediately denies reads and writes after %s is made inactive", async (kind) => {
    const id = await insertProduct();
    if (kind === "membership")
      await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [tenantA, owner().id]);
    else await pool.query("update tenants set status='INACTIVE' where id=$1", [tenantA]);
    await expect(catalog.listProducts(owner().headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(catalog.getProductById(owner().headers, { id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(catalog.updateProduct(owner().headers, { ...input(), id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(catalog.createProduct(owner().headers, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("applies current role changes without requiring login or a context-version change", async () => {
    await pool.query("update tenant_memberships set role='VIEWER' where tenant_id=$1 and user_id=$2", [tenantA, owner().id]);
    expect((await catalog.listProducts(owner().headers)).canWrite).toBe(false);
    await expect(catalog.createProduct(owner().headers, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed when no active context exists", async () => {
    await pool.query("delete from session_tenant_context where session_id=$1", [owner().sessionId]);
    await expect(catalog.listProducts(owner().headers)).rejects.toMatchObject({ code: "NO_TENANT" });
    await expect(catalog.createProduct(owner().headers, input())).rejects.toMatchObject({ code: "NO_TENANT" });
  });

  it("fails closed when context names a tenant without membership", async () => {
    await pool.query("update session_tenant_context set tenant_id=$1 where session_id=$2", [tenantB, owner().sessionId]);
    await expect(catalog.listProducts(owner().headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(catalog.createProduct(owner().headers, input({ expectedVersion: 2 }))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects expired sessions", async () => {
    await pool.query('update "session" set expires_at=now()-interval \'1 hour\' where id=$1', [owner().sessionId]);
    await expect(catalog.listProducts(owner().headers)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(catalog.createProduct(owner().headers, input())).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects stale-tab mutations instead of moving the intent into another company", async () => {
    const id = await insertProduct();
    const before = await productRows();
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'OWNER')", [tenantB, owner().id]);
    await selectCompany(owner().headers, { tenantId: tenantB, expectedVersion: 1 });
    const operations = [
      () => catalog.createProduct(owner().headers, input()),
      () => catalog.updateProduct(owner().headers, { ...input(), id }),
      () => catalog.archiveProduct(owner().headers, { id, expectedVersion: 1 }),
      () => catalog.reactivateProduct(owner().headers, { id, expectedVersion: 1 }),
    ];
    for (const operation of operations) await expect(operation()).rejects.toMatchObject({ code: "STALE_CONTEXT" });
    expect(await productRows(tenantA)).toEqual(before);
    expect(await productRows(tenantB)).toHaveLength(0);
  });

  it("rejects a stale render context before listing another otherwise authorized company", async () => {
    const ownId = await insertProduct(tenantA, { sku: "TENANT-A-PRODUCT", name: "Tenant A product" });
    const otherId = await insertProduct(tenantB, { sku: "TENANT-B-PRODUCT", name: "Tenant B product" });
    const displayed = await catalog.listProducts(owner().headers, {}, 1);
    expect(displayed.items.map(({ id }) => id)).toEqual([ownId]);
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'OWNER')", [tenantB, owner().id]);
    await selectCompany(owner().headers, { tenantId: tenantB, expectedVersion: 1 });
    await expect(catalog.listProducts(owner().headers, {}, 1)).rejects.toMatchObject({ code: "STALE_CONTEXT" });
    const current = await catalog.listProducts(owner().headers, {}, 2);
    expect(current.contextVersion).toBe(2);
    expect(current.items.map(({ id }) => id)).toEqual([otherId]);
    expect(current.items.some(({ id }) => id === ownId)).toBe(false);
    expect((await catalog.listProducts(owner().headers)).items.map(({ id }) => id)).toEqual([otherId]);
  });

  it("does not accept a client tenant in read or update input", async () => {
    const id = await insertProduct();
    await expect(catalog.listProducts(owner().headers, { tenantId: tenantB })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(catalog.getProductById(owner().headers, { id, tenantId: tenantB })).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(catalog.updateProduct(owner().headers, { ...input(), id, tenantId: tenantB })).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("PostgreSQL search, filters, sorting and pagination", () => {
  beforeEach(async () => {
    await pool.query(
      `insert into products(tenant_id,sku,name,category_code,unit_code,status,created_at,updated_at)
       select $1, 'SKU-'||lpad(n::text,3,'0'), 'Product '||lpad(n::text,3,'0'),
       case when n%2=0 then 'FOOD' else 'GENERAL' end, 'UNIT',
       case when n%3=0 then 'INACTIVE' else 'ACTIVE' end,
       timestamptz '2025-01-01T00:00:00Z' + n * interval '1 minute',
       timestamptz '2025-01-01T00:00:00Z' + n * interval '1 minute' from generate_series(1,65) n`,
      [tenantA],
    );
    await insertProduct(tenantB, { sku: "SKU-001", name: "Product 001", category: "FOOD" });
  });

  it("returns only the requested page and a matching tenant-scoped count", async () => {
    const result = await catalog.listProducts(owner().headers);
    expect(result).toMatchObject({ total: 65, page: 1, pageSize: 25, pageCount: 3 });
    expect(result.items).toHaveLength(25);
    expect(result.items[0]!.sku).toBe("SKU-065");
    expect(result.items.at(-1)!.sku).toBe("SKU-041");
  });

  it.each(["  product 06  ", "sKu-06"])("searches SKU/name case-insensitively after trimming (%s)", async (search) => {
    const result = await catalog.listProducts(owner().headers, { search });
    expect(result.total).toBe(6);
    expect(result.items.map(({ sku }) => sku).sort()).toEqual([60, 61, 62, 63, 64, 65].map((n) => `SKU-${n.toString().padStart(3, "0")}`));
  });

  it("combines search, extensible category and status over the complete tenant dataset", async () => {
    const result = await catalog.listProducts(owner().headers, { search: "sku-0", category: " food ", status: "ACTIVE", sort: "sku", direction: "asc", pageSize: 10 });
    const expected = Array.from({ length: 65 }, (_, index) => index + 1).filter((n) => n % 2 === 0 && n % 3 !== 0);
    expect(result.total).toBe(expected.length);
    expect(result.items.map(({ sku }) => sku)).toEqual(expected.slice(0, 10).map((n) => `SKU-${n.toString().padStart(3, "0")}`));
    expect(result.query.category).toBe("FOOD");
  });

  it("treats SQL wildcard and escape characters as literal search text", async () => {
    await insertProduct(tenantA, { sku: "PERCENT%", name: "Contains percent" });
    await insertProduct(tenantA, { sku: "UNDER_SCORE", name: "Contains underscore" });
    await insertProduct(tenantA, { sku: "BACK\\SLASH", name: "Contains backslash" });
    for (const [search, expectedSku] of [["%", "PERCENT%"], ["_", "UNDER_SCORE"], ["\\", "BACK\\SLASH"]]) {
      const result = await catalog.listProducts(owner().headers, { search });
      expect(result.total).toBe(1);
      expect(result.items[0]!.sku).toBe(expectedSku);
    }
  });

  it("sorts the full dataset before selecting a page", async () => {
    const result = await catalog.listProducts(owner().headers, { sort: "name", direction: "asc", page: 2, pageSize: 10 });
    expect(result.items.map(({ name }) => name)).toEqual(Array.from({ length: 10 }, (_, index) => `Product ${(index + 11).toString().padStart(3, "0")}`));
    const descending = await catalog.listProducts(owner().headers, { sort: "sku", direction: "desc", page: 2, pageSize: 10 });
    expect(descending.items.map(({ sku }) => sku)).toEqual(Array.from({ length: 10 }, (_, index) => `SKU-${(55 - index).toString().padStart(3, "0")}`));
  });

  it.each([
    ["name", "asc"], ["name", "desc"], ["createdAt", "asc"], ["createdAt", "desc"],
  ] as const)("uses ascending UUID tie-breakers for %s %s", async (sort, direction) => {
    const tied = await pool.query<{ id: string }>(
      "insert into products(tenant_id,sku,name,category_code,unit_code,created_at,updated_at) select $1,'TIE-'||n,'Same Name','TIES','UNIT','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z' from generate_series(1,3) n returning id",
      [tenantA],
    );
    const expected = tied.rows.map(({ id }) => id).sort();
    const first = await catalog.listProducts(owner().headers, { category: "TIES", sort, direction, pageSize: 10 });
    const again = await catalog.listProducts(owner().headers, { category: "TIES", sort, direction, pageSize: 10 });
    expect(first.items.map(({ id }) => id)).toEqual(expected);
    expect(again.items.map(({ id }) => id)).toEqual(expected);
  });

  it("clamps a page beyond the matching result set", async () => {
    const result = await catalog.listProducts(owner().headers, { page: 500 });
    expect(result).toMatchObject({ total: 65, page: 3, pageSize: 25, pageCount: 3, query: { page: 3 } });
    expect(result.items).toHaveLength(15);
    expect(result.items.at(-1)!.sku).toBe("SKU-001");
  });

  it.each([10, 25, 50, 100])("allows the bounded page size %s", async (pageSize) => {
    const result = await catalog.listProducts(owner().headers, { pageSize });
    expect(result.items).toHaveLength(Math.min(pageSize, 65));
    expect(result.pageSize).toBe(pageSize);
  });

  it("returns a stable empty result instead of an invalid empty-page offset", async () => {
    const result = await catalog.listProducts(owner().headers, { search: "no-match", page: 3 });
    expect(result).toMatchObject({ items: [], total: 0, page: 1, pageCount: 1, query: { page: 1 } });
  });

  it.each([
    { page: 0 }, { page: -1 }, { page: 1.5 }, { pageSize: 101 }, { pageSize: 11 },
    { pageSize: "1e2" }, { page: ["1", "2"] }, { search: ["a", "b"] },
    { sort: "tenant_id" }, { direction: "descending" }, { status: "UNKNOWN" },
    { category: "BAD CATEGORY" }, { search: "x".repeat(201) }, { unexpected: "value" },
  ])("rejects invalid or unknown query parameters (%j)", async (query) => {
    await expect(catalog.listProducts(owner().headers, query)).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
