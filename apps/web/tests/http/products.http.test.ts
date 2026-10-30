import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ChildProcess } from "node:child_process";
import * as schema from "@/server/db/schema";
import type { AuthSession } from "@/server/auth/auth";
import type { ActionManifest } from "next/dist/build/webpack/plugins/flight-client-entry-plugin";
import type { ProductListItem } from "@/lib/products/catalog.types";

type RunningServer = {
  baseUrl: string;
  process: ChildProcess;
  output: () => string;
};

const TEST_PASSWORD = "HTTP-Test-Password-42!";
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "../..");
const migrationsFolder = path.join(webRoot, "drizzle");
const distDirectoryName = `.next-http-${process.pid}`;
const distDirectory = path.join(webRoot, distDirectoryName);
const testTsconfigName = `tsconfig.http-${process.pid}.json`;
const testTsconfigPath = path.join(webRoot, testTsconfigName);
const nextCli = createRequire(import.meta.url).resolve("next/dist/bin/next");
// jsdom is already installed for component tests; use a narrow test-local type
// rather than adding a new declaration dependency just to inspect returned HTML.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string) => { window: { document: Document } };
};

function requireSafeTestDatabaseUrl(value: string | undefined) {
  if (process.env.NODE_ENV !== "test" || !value) {
    throw new Error("HTTP tests require NODE_ENV=test and TEST_DATABASE_URL.");
  }

  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const allowedHosts = new Set(["127.0.0.1", "localhost", "postgres-test"]);
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    databaseName !== "makhzan_test" ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error("Refusing to reset a database outside the isolated HTTP test scope.");
  }
  return value;
}

const testDatabaseUrl = requireSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
const pool = new Pool({ connectionString: testDatabaseUrl, max: 4 });
const database = drizzle({ client: pool, schema });
let enabledServer: RunningServer | undefined;
let disabledServer: RunningServer | undefined;
let authenticatedCookie: string | undefined;
let privateTenantId: string;
let memberTenantId: string;
const PRIVATE_PRODUCT_SKU = "PRIVATE-TENANT-PRODUCT";
const OWN_PRODUCT_SKU = "HTTP-PRODUCT-060";

type CatalogResponse = {
  data: ProductListItem[];
  meta: { total: number; page: number; pageSize: number; pageCount: number };
};
type ProductMutationResult =
  | { ok: true; product: ProductListItem }
  | { ok: false; code: string };

function renderedDocument(html: string) {
  return new JSDOM(html).window.document;
}

function mutationResult(body: string): ProductMutationResult {
  for (const line of body.split("\n")) {
    const payload = line.slice(line.indexOf(":") + 1);
    if (!payload.startsWith('{"ok":')) continue;
    return JSON.parse(payload) as ProductMutationResult;
  }
  throw new Error("The Server Action response contained no typed mutation result.");
}

async function identityFor(cookie: string) {
  if (!enabledServer) throw new Error("Test server unavailable.");
  const response = await fetch(`${enabledServer.baseUrl}/api/auth/get-session`, {
    headers: { Cookie: cookie },
  });
  if (!response.ok) throw new Error("HTTP fixture session lookup failed.");
  return response.json() as Promise<AuthSession>;
}

async function currentVersion(cookie: string) {
  const identity = await identityFor(cookie);
  const context = await pool.query<{ version: number }>(
    "select version from session_tenant_context where session_id=$1", [identity.session.id],
  );
  if (!context.rows[0]) throw new Error("HTTP fixture has no selected company.");
  return context.rows[0].version;
}

async function readCatalog(query = "", cookie = authenticatedCookie ?? "") {
  if (!enabledServer) throw new Error("Test server unavailable.");
  const response = await fetch(`${enabledServer.baseUrl}/api/products${query}`, {
    headers: { Cookie: cookie },
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<CatalogResponse>;
}

function productInput(sku: string, expectedVersion: number) {
  return { sku, name: `Product ${sku}`, categoryCode: "HTTP/PRODUCTS", unitCode: "UNIT", expectedVersion };
}

async function seedCatalog(tenantId: string) {
  // Explicit fixture data belongs only to this suite's guarded disposable DB.
  await pool.query(
    `insert into products(tenant_id,sku,name,category_code,unit_code,status,created_at)
     select $1, 'HTTP-PRODUCT-' || lpad(i::text,3,'0'),
       case when i >= 59 then 'HTTP Item tie' else 'HTTP Item ' || lpad(i::text,3,'0') end,
       case when i % 3 = 0 then 'FOOD' when i % 3 = 1 then 'OFFICE' else 'CLEANING' end,
       'UNIT', case when i % 4 = 0 then 'INACTIVE' else 'ACTIVE' end,
       timestamptz '2026-01-01 00:00:00+00' + i * interval '1 second'
     from generate_series(1,60) as i`,
    [tenantId],
  );
  await pool.query(
    `insert into products(tenant_id,sku,name,category_code,unit_code,created_at)
     values ($1,'HTTP%_LITERAL','Literal 100%_ match','CUSTOM/CATEGORY','CUSTOM.UNIT',timestamptz '2025-01-01 00:00:00+00')`,
    [tenantId],
  );
}

function nextEnvironment(
  demoApiEnabled: boolean,
  authBaseUrl = "http://127.0.0.1:3000",
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    NODE_ENV: "production",
    NEXT_DIST_DIR: distDirectoryName,
    NEXT_TSCONFIG: testTsconfigName,
    NEXT_TELEMETRY_DISABLED: "1",
    ENABLE_DEMO_PRODUCTS_API: demoApiEnabled ? "true" : "false",
    DATABASE_URL: testDatabaseUrl,
    BETTER_AUTH_SECRET: "synthetic-http-test-secret-at-least-32-characters",
    BETTER_AUTH_URL: authBaseUrl,
    AUTH_TRUSTED_ORIGINS: authBaseUrl,
    AUTH_TEST_MODE: "true",
  };
}

async function runProductionBuild() {
  const child = spawn(process.execPath, [nextCli, "build"], {
    cwd: webRoot,
    env: nextEnvironment(false),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const [exitCode] = (await once(child, "exit")) as [number | null];
  if (exitCode !== 0) {
    throw new Error(`Next.js test build failed with exit code ${exitCode}.\n${output}`);
  }
}

async function reserveAvailablePort(): Promise<number> {
  const server = createServer();
  server.unref();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("Unable to reserve a TCP port for the HTTP test server.");
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function startProductionServer(demoApiEnabled: boolean): Promise<RunningServer> {
  const port = await reserveAvailablePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(
    process.execPath,
    [nextCli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: webRoot,
      env: nextEnvironment(demoApiEnabled, baseUrl),
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Next.js server exited before readiness.\n${output}`);
    }
    try {
      await fetch(`${baseUrl}/en/sign-in`);
      return { baseUrl, process: child, output: () => output };
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }

  child.kill("SIGKILL");
  throw new Error(`Next.js server readiness timed out.\n${output}`);
}

async function stopServer(server: RunningServer | undefined) {
  if (!server || server.process.exitCode !== null) return;
  const exited = once(server.process, "exit");
  server.process.kill("SIGTERM");
  const timedOut = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), 5_000).unref();
  });
  if ((await Promise.race([exited, timedOut])) === "timeout") {
    if (server.process.exitCode === null) server.process.kill("SIGKILL");
    await exited;
  }
}

async function authenticate(server: RunningServer, withCompany = true, suffix = "") {
  // Independent HTTP fixtures share loopback. Isolate only their signup/login
  // counters; production limits and the authentication limiter tests stay intact.
  await pool.query("delete from rate_limit where key in ('127.0.0.1|/sign-up/email', '127.0.0.1|/sign-in/email')");
  const email = `http-${process.pid}${suffix}@example.test`;
  const headers = { "Content-Type": "application/json", Origin: server.baseUrl };
  const registration = await fetch(`${server.baseUrl}/api/auth/sign-up/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ name: "HTTP Test User", email, password: TEST_PASSWORD }),
  });
  if (!registration.ok) {
    throw new Error(`HTTP test registration failed: ${await registration.text()}`);
  }

  const login = await fetch(`${server.baseUrl}/api/auth/sign-in/email`, {
    method: "POST",
    headers,
    body: JSON.stringify({ email, password: TEST_PASSWORD }),
  });
  if (!login.ok) throw new Error(`HTTP test login failed: ${await login.text()}`);
  const cookies = login.headers
    .getSetCookie()
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => Boolean(value));
  if (cookies.length === 0) throw new Error("HTTP test login set no session cookie.");
  const cookie = cookies.join("; ");
  if (withCompany) {
    const sessionResponse = await fetch(`${server.baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie } });
    const identity = await sessionResponse.json() as AuthSession;
    const existing = await pool.query<{ tenant_id: string }>("select tenant_id from tenant_memberships where user_id=$1", [identity.user.id]);
    if (existing.rows[0]) memberTenantId = existing.rows[0].tenant_id;
    else {
      const tenant = await pool.query<{ id: string }>("insert into tenants(name,base_currency) values ('HTTP Authorized Company','AED') returning id");
      memberTenantId = tenant.rows[0]!.id;
      await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'OWNER')", [memberTenantId,identity.user.id]);
    }
    await pool.query("insert into session_tenant_context(session_id,tenant_id) values ($1,$2)", [identity.session.id,memberTenantId]);
  }
  return cookie;
}

async function action(name: string, route: string, input: unknown, cookie: string, origin?: string) {
  if (!enabledServer) throw new Error("Test server unavailable.");
  const manifest = JSON.parse(await readFile(path.join(distDirectory, "server/server-reference-manifest.json"), "utf8")) as ActionManifest;
  const id = Object.entries(manifest.node).find(([, entry]) => entry.exportedName === name)?.[0];
  if (!id) throw new Error(`Missing real Next.js Server Action: ${name}`);
  return fetch(`${enabledServer.baseUrl}${route}`, {
    method: "POST", headers: {
      "Next-Action": id, "Content-Type": "text/plain;charset=UTF-8", Accept: "text/x-component",
      Origin: origin ?? enabledServer.baseUrl, Cookie: cookie,
    }, body: JSON.stringify([input]), redirect: "manual",
  });
}

beforeAll(async () => {
  if (
    path.dirname(distDirectory) !== webRoot ||
    !path.basename(distDirectory).startsWith(".next-http-")
  ) {
    throw new Error("Refusing to use an unsafe HTTP test build directory.");
  }

  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await migrate(database, { migrationsFolder });
  const tenant = await pool.query<{ id: string }>(
    'insert into tenants (name, base_currency) values ($1, $2) returning id',
    ["Private test business", "AED"],
  );
  privateTenantId = tenant.rows[0]!.id;
  await pool.query(
    'insert into products (tenant_id, sku, name, category_code, unit_code) values ($1, $2, $3, $4, $5)',
    [privateTenantId, PRIVATE_PRODUCT_SKU, "Private tenant data", "TEST", "UNIT"],
  );
  await rm(distDirectory, { recursive: true, force: true });
  await writeFile(
    testTsconfigPath,
    `${JSON.stringify(
      {
        extends: "./tsconfig.json",
        include: [
          "next-env.d.ts",
          "**/*.mts",
          "**/*.ts",
          "**/*.tsx",
          `${distDirectoryName}/types/**/*.ts`,
          `${distDirectoryName}/dev/types/**/*.ts`,
        ],
        exclude: ["node_modules"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await runProductionBuild();
  enabledServer = await startProductionServer(true);
  disabledServer = await startProductionServer(false);
  authenticatedCookie = await authenticate(enabledServer);
  await seedCatalog(memberTenantId);
});

afterAll(async () => {
  await Promise.all([stopServer(enabledServer), stopServer(disabledServer)]);
  await pool.end();
  await rm(distDirectory, { recursive: true, force: true });
  await rm(testTsconfigPath, { force: true });
});

describe("products HTTP contracts", () => {
  it("requires a valid session for the tenant-owned catalog API", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
  });

  it("serves only a bounded PostgreSQL product page to an authenticated member", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: authenticatedCookie ?? "" },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("cache-control")).toContain("private");
    expect(body).toMatchObject({ meta: { total: 61, page: 1, pageSize: 25, pageCount: 3 } });

    if (
      typeof body !== "object" ||
      body === null ||
      !("data" in body) ||
      !Array.isArray(body.data)
    ) {
      throw new Error("Products response did not contain a data array.");
    }
    expect(body.data).toHaveLength(25);
    const ids = body.data.map((product: unknown) => {
      if (typeof product !== "object" || product === null || !("id" in product)) {
        throw new Error("Product response item did not contain an id.");
      }
      return product.id;
    });
    expect(new Set(ids).size).toBe(ids.length);
    expect(JSON.stringify(body)).not.toContain(PRIVATE_PRODUCT_SKU);
    expect(JSON.stringify(body)).not.toContain("synthetic-demo");
    expect(body.data[0]).toMatchObject({ sku: OWN_PRODUCT_SKU, categoryCode: "FOOD", unitCode: "UNIT" });
    expect(body.data[0]).not.toHaveProperty("tenantId");
  });

  it("rejects unsupported methods through the running Next.js server", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      method: "POST",
    });
    expect(response.status).toBe(405);
  });

  it("retires the demo flag without making the replacement endpoint public", async () => {
    const response = await fetch(`${disabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: authenticatedCookie ?? "" },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ meta: { total: 61, pageSize: 25 } });
    const unauthenticated = await fetch(`${disabledServer?.baseUrl}/api/products`);
    expect(unauthenticated.status).toBe(401);
  });
});

describe("localized authentication and protected routes", () => {
  it.each(["en", "ar"])(
    "blocks unauthenticated /%s/products content and redirects to localized sign-in",
    async (locale) => {
      const response = await fetch(`${disabledServer?.baseUrl}/${locale}/products`, {
        redirect: "manual",
      });
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).not.toContain(OWN_PRODUCT_SKU);
      expect(html).toContain(`NEXT_REDIRECT;replace;/${locale}/sign-in;307;`);
    },
  );

  it.each([
    { locale: "en", direction: "ltr", title: "Products" },
    { locale: "ar", direction: "rtl", title: "المنتجات" },
  ])(
    "serves /$locale/products as protected $direction HTML with a valid session",
    async ({ locale, direction, title }) => {
      const response = await fetch(`${disabledServer?.baseUrl}/${locale}/products`, {
        headers: { Cookie: authenticatedCookie ?? "" },
      });
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(html).toContain(`<html lang="${locale}" dir="${direction}"`);
      expect(html).toContain(title);
      expect(html).toContain(OWN_PRODUCT_SKU);
      expect(html).not.toContain("BEV-WAT-001");
      expect(html).not.toContain(PRIVATE_PRODUCT_SKU);
    },
  );

  it.each([
    { locale: "en", route: "sign-in", label: "Welcome back" },
    { locale: "ar", route: "sign-in", label: "مرحبًا بعودتك" },
    { locale: "en", route: "sign-up", label: "Create your account" },
    { locale: "ar", route: "sign-up", label: "أنشئ حسابك" },
  ])("serves /$locale/$route without a session", async ({ locale, route, label }) => {
    const response = await fetch(`${disabledServer?.baseUrl}/${locale}/${route}`);
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(label);
  });
});

describe("protected content security boundaries", () => {
  it.each([
    ["en", ""], ["ar", ""],
    ["en", "/pending-setup"], ["ar", "/pending-setup"],
  ])("requires a server-validated session for /%s%s", async (locale, route) => {
    const response = await fetch(`${disabledServer?.baseUrl}/${locale}${route}`, {
      redirect: "manual",
      headers: { Cookie: "makhzan.session_token=forged-session" },
    });
    const html = await response.text();
    expect(html).toContain(`NEXT_REDIRECT;replace;/${locale}/sign-in;307;`);
    expect(html).not.toContain("HTTP Test User");
    expect(html).not.toContain(`http-${process.pid}@example.test`);
  });

  it("rejects a forged session cookie at the API independently of proxy routing", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: "makhzan.session_token=forged-session" },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("does not expose tenant records or accept tenant selection from the caller", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products?tenant_id=${privateTenantId}`, {
      headers: { Cookie: authenticatedCookie ?? "", "X-Tenant-Id": privateTenantId },
    });
    expect(response.status).toBe(400);
    const body = await response.text();
    expect(body).toContain("INVALID_INPUT");
    expect(body).not.toContain(PRIVATE_PRODUCT_SKU);
    expect(body).not.toContain(privateTenantId);
    const headerOnly = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: authenticatedCookie ?? "", "X-Tenant-Id": privateTenantId },
    });
    expect(headerOnly.status).toBe(200);
    expect(await headerOnly.text()).not.toContain(PRIVATE_PRODUCT_SKU);
    for (const locale of ["en", "ar"]) {
      const page = await fetch(`${disabledServer?.baseUrl}/${locale}/products?tenant_id=${privateTenantId}`, {
        headers: { Cookie: authenticatedCookie ?? "" },
      });
      expect(page.status).toBe(200);
      expect(await page.text()).not.toContain(PRIVATE_PRODUCT_SKU);
    }
  });

  it("revokes API and page access immediately after HTTP logout", async () => {
    if (!enabledServer) throw new Error("Test server is unavailable.");
    const cookie = await authenticate(enabledServer);
    const logout = await fetch(`${enabledServer.baseUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: { Cookie: cookie, Origin: enabledServer.baseUrl, "Content-Type": "application/json" },
      body: "{}",
    });
    expect(logout.status).toBe(200);
    const api = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
    expect(api.status).toBe(401);
    const page = await fetch(`${enabledServer.baseUrl}/en/products`, { headers: { Cookie: cookie } });
    const html = await page.text();
    expect(html).not.toContain(OWN_PRODUCT_SKU);
    expect(html).toContain("NEXT_REDIRECT;replace;/en/sign-in;307;");
  });
});

describe("company onboarding and active-context HTTP boundaries", () => {
  it.each(["en", "ar"])("requires a session for /%s/onboarding and selection", async (locale) => {
    for (const route of ["onboarding", "select-company"]) {
      const response = await fetch(`${enabledServer?.baseUrl}/${locale}/${route}`);
      const html = await response.text();
      expect(html).toContain(`NEXT_REDIRECT;replace;/${locale}/sign-in;307;`);
      expect(html).not.toContain("HTTP Authorized Company");
    }
  });

  it("blocks authenticated users without membership from both catalog and Dashboard", async () => {
    if (!enabledServer) throw new Error("Test server unavailable.");
    const cookie = await authenticate(enabledServer, false, "-no-company");
    const api = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
    expect(api.status).toBe(403);
    for (const locale of ["en", "ar"]) {
      const page = await fetch(`${enabledServer.baseUrl}/${locale}/products`, { headers: { Cookie: cookie } });
      const html = await page.text();
      expect(html).not.toContain("BEV-WAT-001");
      expect(html).toContain(`NEXT_REDIRECT;replace;/${locale}/onboarding;307;`);
      const onboarding = await fetch(`${enabledServer.baseUrl}/${locale}/onboarding`, { headers: { Cookie: cookie } });
      expect(onboarding.status).toBe(200);
      const onboardingHtml = await onboarding.text();
      expect(onboardingHtml).toContain(locale === "ar" ? "أنشئ شركتك" : "Create your company");
      expect(onboardingHtml).toContain(`<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"`);
      expect(onboardingHtml).toMatch(/<select[^>]*name="baseCurrency"/);
      expect(onboardingHtml).toContain('<option value="TRY">');
      expect(onboardingHtml).toMatch(/<select[^>]*name="timezone"/);
      expect(onboardingHtml).toContain('<option value="Europe/Istanbul">');
      expect(onboardingHtml).not.toContain('<option value="TR">');
      expect(onboardingHtml).not.toContain('<option value="Europe/Turkey">');
    }
  });

  it("creates a company through the real Server Action and safely replays the result", async () => {
    if (!enabledServer) throw new Error("Test server unavailable.");
    const cookie = await authenticate(enabledServer, false, "-onboarding-action");
    const input = { name: "Action Company", baseCurrency: "TRY", timezone: "Europe/Istanbul", operationId: randomUUID() };
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await action("createCompanyAction", "/en/onboarding", input, cookie);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('"ok":true');
    }
    const companies = await pool.query<{ count: number }>("select count(*)::int count from tenants where name='Action Company'");
    expect(companies.rows[0]!.count).toBe(1);
    const settings = await pool.query<{ base_currency: string; timezone: string }>(
      "select base_currency, timezone from tenants where name='Action Company'",
    );
    expect(settings.rows).toEqual([{ base_currency: "TRY", timezone: "Europe/Istanbul" }]);
    const page = await fetch(`${enabledServer.baseUrl}/ar/products`, { headers: { Cookie: cookie } });
    const html = await page.text();
    expect(html).toContain("Action Company");
    expect(html).not.toContain("BEV-WAT-001");
    expect(html).not.toContain(OWN_PRODUCT_SKU);
    expect(renderedDocument(html).body.textContent).toContain("لا توجد منتجات بعد");
    const empty = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
    expect(await empty.json()).toMatchObject({ data: [], meta: { total: 0 } });
    expect(html).toContain('dir="rtl"');
    // Alternate sessions against the same route on the same Next.js process.
    // Neither Server Component output nor authorization may be shared by tenant.
    for (const locale of ["en", "ar"]) {
      for (const [sessionCookie, ownName, otherName] of [
        [cookie, "Action Company", "HTTP Authorized Company"],
        [authenticatedCookie ?? "", "HTTP Authorized Company", "Action Company"],
        [cookie, "Action Company", "HTTP Authorized Company"],
      ]) {
        const response = await fetch(`${enabledServer.baseUrl}/${locale}/products`, {
          headers: { Cookie: sessionCookie! },
        });
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(body).toContain(ownName);
        expect(body).not.toContain(otherName);
        expect(body).not.toContain(PRIVATE_PRODUCT_SKU);
        expect(body.includes(OWN_PRODUCT_SKU)).toBe(sessionCookie === authenticatedCookie);
        expect(response.headers.get("cache-control")).toContain("no-store");
      }
    }
  });

  it("enforces authentication, input validation, and CSRF on onboarding actions", async () => {
    const input = { name: "Rejected", baseCurrency: "AED", timezone: "Asia/Dubai", operationId: randomUUID() };
    const unauthenticated = await action("createCompanyAction", "/en/onboarding", input, "");
    expect(await unauthenticated.text()).toContain("UNAUTHENTICATED");
    const invalid = await action("createCompanyAction", "/en/onboarding", { ...input, role: "OWNER" }, authenticatedCookie ?? "");
    expect(await invalid.text()).toContain("INVALID_INPUT");
    for (const change of [{ baseCurrency: "Tr" }, { timezone: "Europe/Turkey" }]) {
      const invalidDetails = await action("createCompanyAction", "/en/onboarding", { ...input, ...change }, authenticatedCookie ?? "");
      expect(await invalidDetails.text()).toContain("INVALID_INPUT");
    }
    const hostile = await action("createCompanyAction", "/en/onboarding", input, authenticatedCookie ?? "", "https://hostile.example");
    expect(hostile.status).toBeGreaterThanOrEqual(400);
    const companies = await pool.query<{ count: number }>("select count(*)::int count from tenants where name='Rejected'");
    expect(companies.rows[0]!.count).toBe(0);
  });

  it("rejects forged selection and stale selection versions over HTTP", async () => {
    const forged = await action("selectCompanyAction", "/en/select-company", { tenantId: privateTenantId, expectedVersion: 1 }, authenticatedCookie ?? "");
    expect(await forged.text()).toContain("FORBIDDEN");
    const selected = await action("selectCompanyAction", "/en/select-company", { tenantId: memberTenantId, expectedVersion: 1 }, authenticatedCookie ?? "");
    expect(await selected.text()).toContain('"ok":true');
    const stale = await action("selectCompanyAction", "/en/select-company", { tenantId: memberTenantId, expectedVersion: 1 }, authenticatedCookie ?? "");
    expect(await stale.text()).toContain("STALE_CONTEXT");
  });

  it("requires explicit selection in a fresh session and immediately denies revoked access", async () => {
    if (!enabledServer) throw new Error("Test server unavailable.");
    const cookie = await authenticate(enabledServer, false, "-selection");
    const response = await fetch(`${enabledServer.baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie } });
    const identity = await response.json() as AuthSession;
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'VIEWER')", [memberTenantId, identity.user.id]);
    const alternative = await pool.query<{ id: string }>("insert into tenants(name,base_currency) values ('HTTP Selection Alternative','AED') returning id");
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'VIEWER')", [alternative.rows[0]!.id, identity.user.id]);
    const unresolved = await action("resolveCompanyEntryAction", "/en/sign-in", undefined, cookie);
    expect(await unresolved.text()).toContain('"destination":"/select-company"');
    const blocked = await fetch(`${enabledServer.baseUrl}/en/products`, { headers: { Cookie: cookie } });
    expect(await blocked.text()).toContain("NEXT_REDIRECT;replace;/en/select-company;307;");
    for (const locale of ["en", "ar"]) {
      const selection = await fetch(`${enabledServer.baseUrl}/${locale}/select-company`, { headers: { Cookie: cookie } });
      const html = await selection.text();
      expect(html).toContain("HTTP Authorized Company");
      expect(html).not.toContain("Private test business");
    }
    const selected = await action("selectCompanyAction", "/en/select-company", { tenantId: memberTenantId, expectedVersion: 0 }, cookie);
    expect(await selected.text()).toContain('"ok":true');
    const allowed = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
    expect(allowed.status).toBe(200);
    await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [memberTenantId,identity.user.id]);
    const revoked = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
    expect(revoked.status).toBe(403);
    const page = await fetch(`${enabledServer.baseUrl}/ar/products`, { headers: { Cookie: cookie } });
    const html = await page.text();
    expect(html).not.toContain("BEV-WAT-001");
    expect(html).not.toContain("HTTP Authorized Company");
  });

  it.each(["en", "ar"])("bootstraps a sole company via POST, never GET, in %s", async (locale) => {
    if (!enabledServer) throw new Error("Test server unavailable.");
    // Independent fixtures share the same loopback client. Clear only their
    // signup/login counters in the already-guarded disposable test database.
    // Runtime throttling and its separate authentication tests stay unchanged.
    await pool.query("delete from rate_limit where key in ('127.0.0.1|/sign-up/email', '127.0.0.1|/sign-in/email')");
    const cookie = await authenticate(enabledServer, false, `-auto-${locale}`);
    const identity = await (await fetch(`${enabledServer.baseUrl}/api/auth/get-session`, { headers: { Cookie: cookie } })).json() as AuthSession;
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'VIEWER')", [memberTenantId, identity.user.id]);
    for (let i = 0; i < 2; i++) {
      const response = await fetch(`${enabledServer.baseUrl}/${locale}/select-company`, { headers: { Cookie: cookie } });
      const html = await response.text();
      expect(response.status).toBe(200);
      expect(html).toContain(locale === "ar" ? "جارٍ فتح مساحة العمل" : "Opening your workspace");
      const context = await pool.query("select * from session_tenant_context where session_id=$1", [identity.session.id]);
      expect(context.rows).toHaveLength(0);
    }
    const post = await action("resolveCompanyEntryAction", `/${locale}/select-company`, undefined, cookie);
    expect(await post.text()).toContain('"destination":"/"');
    const before = await pool.query("select * from session_tenant_context where session_id=$1", [identity.session.id]);
    const replay = await action("resolveCompanyEntryAction", `/${locale}/select-company`, undefined, cookie);
    expect(await replay.text()).toContain('"destination":"/"');
    const page = await fetch(`${enabledServer.baseUrl}/${locale}`, { headers: { Cookie: cookie } });
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("HTTP Authorized Company");
    expect(html).toContain(locale === "ar" ? "المشاهد" : "Viewer");
    expect(html).toContain(`aria-label="${locale === "ar" ? "الشركة النشطة" : "Active company"}"`);
    expect(html.includes('aria-label="Switch company:')).toBe(false);
    expect(html.includes('aria-label="تبديل الشركة:')).toBe(false);
    const after = await pool.query("select * from session_tenant_context where session_id=$1", [identity.session.id]);
    expect(after.rows).toEqual(before.rows);
    expect(after.rows[0].version).toBe(1);
    await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [memberTenantId, identity.user.id]);
    const revoked = await action("resolveCompanyEntryAction", `/${locale}/select-company`, undefined, cookie);
    expect(await revoked.text()).toContain('"destination":"/onboarding"');
    const unavailable = await fetch(`${enabledServer.baseUrl}/${locale}/onboarding`, { headers: { Cookie: cookie } });
    const unavailableHtml = await unavailable.text();
    expect(unavailable.status).toBe(200);
    expect(unavailableHtml).toContain(locale === "ar" ? "الوصول إلى الشركة غير متاح" : "Company access unavailable");
    expect(unavailableHtml.includes('id="company-name"')).toBe(false);
    const retained = await pool.query("select * from session_tenant_context where session_id=$1", [identity.session.id]);
    expect(retained.rows).toEqual(before.rows);
  });

  it("protects automatic entry from unauthenticated and forged-origin requests", async () => {
    const unauthenticated = await action("resolveCompanyEntryAction", "/en/sign-in", undefined, "");
    expect(await unauthenticated.text()).toContain("UNAUTHENTICATED");
    const hostile = await action("resolveCompanyEntryAction", "/en/sign-in", undefined, authenticatedCookie ?? "", "https://hostile.example");
    expect(hostile.status).toBeGreaterThanOrEqual(400);
  });
});

describe("database-backed Products query contracts", () => {
  it("combines normalized search, category and status filters over the full tenant dataset", async () => {
    const query = new URLSearchParams({ search: "  http item  ", category: "food", status: "ACTIVE", sort: "sku", direction: "asc", page: "2", pageSize: "10" });
    const body = await readCatalog(`?${query}`);
    const expected = await pool.query<{ id: string }>(
      "select id from products where tenant_id=$1 and name ilike '%http item%' and category_code='FOOD' and status='ACTIVE' order by sku asc,id asc offset 10 limit 10", [memberTenantId],
    );
    expect(body.data.map(({ id }) => id)).toEqual(expected.rows.map(({ id }) => id));
    expect(body.meta).toEqual({ total: 15, page: 2, pageSize: 10, pageCount: 2 });
    expect(body.data).toHaveLength(5);
    expect(body.data.every(({ categoryCode, status }) => categoryCode === "FOOD" && status === "ACTIVE")).toBe(true);
  });

  it("treats wildcard characters as literal search text rather than unrestricted patterns", async () => {
    const body = await readCatalog(`?${new URLSearchParams({ search: "%_" })}`);
    expect(body.meta.total).toBe(1);
    expect(body.data.map(({ sku }) => sku)).toEqual(["HTTP%_LITERAL"]);
    const bySku = await readCatalog("?search=http-product-060");
    expect(bySku.meta.total).toBe(1);
    expect(bySku.data[0]?.sku).toBe(OWN_PRODUCT_SKU);
  });

  it("sorts the complete dataset across pages with a stable UUID tie-breaker", async () => {
    const expected = await pool.query<{ id: string }>(
      "select id from products where tenant_id=$1 order by name asc,id asc", [memberTenantId],
    );
    const ids: string[] = [];
    for (let page = 1; page <= 7; page++) {
      const body = await readCatalog(`?sort=name&direction=asc&pageSize=10&page=${page}`);
      expect(body.data.length).toBeLessThanOrEqual(10);
      ids.push(...body.data.map(({ id }) => id));
    }
    expect(ids).toEqual(expected.rows.map(({ id }) => id));
    expect(new Set(ids).size).toBe(61);
    const ties = await readCatalog(`?${new URLSearchParams({ search: "HTTP Item tie", sort: "name", direction: "desc" })}`);
    expect(ties.data).toHaveLength(2);
    expect(ties.data.map(({ id }) => id)).toEqual(ties.data.map(({ id }) => id).sort());
  });

  it("clamps an out-of-range page and returns a consistent zero-result page", async () => {
    const last = await readCatalog("?page=99999&pageSize=10&sort=sku&direction=asc");
    expect(last.meta).toEqual({ total: 61, page: 7, pageSize: 10, pageCount: 7 });
    expect(last.data).toHaveLength(1);
    const empty = await readCatalog("?search=no-product-matches-this-filter&page=8");
    expect(empty).toMatchObject({ data: [], meta: { total: 0, page: 1, pageCount: 1 } });
  });

  it.each([
    "page=0", "pageSize=1000", "sort=tenant_id", "direction=desc%3Bdrop", "search=a&search=b", "category=BAD%20CODE", "unknown=true",
    "constructor=x", "search=%00",
  ])("rejects invalid query parameters without returning tenant data (%s)", async (query) => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products?${query}`, { headers: { Cookie: authenticatedCookie ?? "" } });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toContain("no-store");
    const body = await response.text();
    expect(JSON.parse(body)).toEqual({ error: { code: "INVALID_INPUT", message: "Invalid product query." } });
    expect(body).not.toContain(OWN_PRODUCT_SKU);
    expect(body).not.toContain(PRIVATE_PRODUCT_SKU);
    expect(body).not.toContain("postgresql://");
  });

  it.each(["__proto__=x", "__proto__=x&__proto__=y"])(
    "keeps framework-normalized prototype-key requests bounded and tenant-scoped (%s)",
    async (query) => {
      if (!enabledServer || !authenticatedCookie) throw new Error("Test fixture unavailable.");
      // Installed Next 16.4.2 calls normalizeCdnUrl before constructing the Route
      // Handler Request. Its parseReqUrl -> Object.entries reconstruction drops
      // these prototype keys, so userland cannot return a 400 for the removed key.
      // Raw application-parser unit tests still require strict rejection. Here,
      // verify the actual HTTP boundary does not widen authorization or filters.
      const baseline = await readCatalog();
      const response = await fetch(`${enabledServer.baseUrl}/api/products?${query}`, {
        headers: { Cookie: authenticatedCookie, "X-Tenant-Id": privateTenantId },
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("application/json");
      expect(response.headers.get("cache-control")).toContain("private");
      expect(response.headers.get("cache-control")).toContain("no-store");
      const body = await response.json() as CatalogResponse;
      expect(body).toEqual(baseline);
      expect(Object.keys(body).sort()).toEqual(["data", "meta"]);
      expect(body.meta).toEqual({ total: 61, page: 1, pageSize: 25, pageCount: 3 });
      expect(body.data).toHaveLength(25);
      const owned = await pool.query<{ id: string }>("select id from products where tenant_id=$1", [memberTenantId]);
      const ownedIds = new Set(owned.rows.map(({ id }) => id));
      for (const product of body.data) {
        expect(ownedIds.has(product.id)).toBe(true);
        expect(Object.keys(product).sort()).toEqual([
          "categoryCode", "createdAt", "id", "name", "sku", "status", "unitCode", "updatedAt",
        ]);
      }
      expect(JSON.stringify(body)).not.toContain(PRIVATE_PRODUCT_SKU);
      expect(JSON.stringify(body)).not.toContain(privateTenantId);
      const filtered = await readCatalog(`?${query}&search=HTTP-PRODUCT-060`);
      expect(filtered.meta.total).toBe(1);
      expect(filtered.data.map(({ sku }) => sku)).toEqual([OWN_PRODUCT_SKU]);
      const anonymous = await fetch(`${enabledServer.baseUrl}/api/products?${query}`);
      expect(anonymous.status).toBe(401);
      expect(await readCatalog()).toEqual(baseline);
    },
  );

  it("renders coherent company labels, products and context versions after explicit switches", async () => {
    if (!enabledServer) throw new Error("Test fixture unavailable.");
    const cookie = await authenticate(enabledServer, false, "-render-context");
    const identity = await identityFor(cookie);
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$3,'VIEWER'),($2,$3,'VIEWER')", [memberTenantId, privateTenantId, identity.user.id]);
    await pool.query("insert into session_tenant_context(session_id,tenant_id) values ($1,$2)", [identity.session.id, memberTenantId]);
    for (const [tenantId, name, sku, foreignSku, locale] of [
      [memberTenantId, "HTTP Authorized Company", OWN_PRODUCT_SKU, PRIVATE_PRODUCT_SKU, "en"],
      [privateTenantId, "Private test business", PRIVATE_PRODUCT_SKU, OWN_PRODUCT_SKU, "ar"],
      [memberTenantId, "HTTP Authorized Company", OWN_PRODUCT_SKU, PRIVATE_PRODUCT_SKU, "en"],
    ]) {
      const switched = await action("selectCompanyAction", `/${locale}/select-company`, {
        tenantId, expectedVersion: await currentVersion(cookie),
      }, cookie);
      expect(await switched.text()).toContain('"ok":true');
      const version = await currentVersion(cookie);
      const response = await fetch(`${enabledServer.baseUrl}/${locale}/products`, { headers: { Cookie: cookie } });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      const html = await response.text();
      const document = renderedDocument(html);
      expect(document.querySelector("header")?.textContent).toContain(name);
      // Inspect the complete streamed response: Next may emit the page body in
      // deferred templates that a non-executing HTML parser does not relocate.
      expect(html).toContain(sku);
      expect(html).not.toContain(foreignSku);
      const renderedVersions = [...html.replaceAll('\\"', '"').matchAll(/"contextVersion":(\d+)/g)]
        .map((match) => Number(match[1]));
      expect(renderedVersions.length).toBeGreaterThanOrEqual(2);
      expect(renderedVersions.every((rendered) => rendered === version)).toBe(true);
    }
  });
});

describe("Products Server Action authorization and persistence", () => {
  it.each(["OWNER", "MANAGER", "STAFF", "VIEWER"] as const)("enforces %s write permissions independently of role-specific controls", async (role) => {
    if (!enabledServer || !authenticatedCookie) throw new Error("Test fixture unavailable.");
    const identity = await identityFor(authenticatedCookie);
    await pool.query("update tenant_memberships set role=$1 where tenant_id=$2 and user_id=$3", [role, memberTenantId, identity.user.id]);
    try {
      const canWrite = role === "OWNER" || role === "MANAGER";
      const response = await fetch(`${enabledServer.baseUrl}/en/products?search=HTTP-PRODUCT-060`, { headers: { Cookie: authenticatedCookie } });
      const document = renderedDocument(await response.text());
      const buttons = [...document.querySelectorAll("button")];
      const writeControls = buttons.filter((button) => button.textContent?.trim() === "Add product" || /^(Edit|Archive|Reactivate) /.test(button.getAttribute("aria-label") ?? ""));
      expect(writeControls.length > 0).toBe(canWrite);
      const read = await readCatalog("?search=HTTP-PRODUCT-060");
      expect(read.data).toHaveLength(1);
      const input = productInput(`HTTP-ROLE-${role}`, await currentVersion(authenticatedCookie));
      const created = await action("createProductAction", "/en/products", input, authenticatedCookie);
      const body = await created.text();
      const result = mutationResult(body);
      if (canWrite) {
        expect(result).toMatchObject({ ok: true, product: { sku: input.sku } });
        expect((body.match(new RegExp(input.sku, "g")) ?? []).length).toBeGreaterThan(1);
      } else expect(result).toEqual({ ok: false, code: "FORBIDDEN" });
      const saved = await pool.query<{ count: number }>("select count(*)::int count from products where tenant_id=$1 and sku=$2", [memberTenantId, input.sku]);
      expect(saved.rows[0]?.count).toBe(canWrite ? 1 : 0);
    } finally {
      await pool.query("update tenant_memberships set role='OWNER' where tenant_id=$1 and user_id=$2", [memberTenantId, identity.user.id]);
    }
  });

  it("creates, updates, archives and reactivates through real actions without changing ownership", async () => {
    if (!authenticatedCookie || !enabledServer) throw new Error("Test fixture unavailable.");
    const expectedVersion = await currentVersion(authenticatedCookie);
    const initial = productInput("  http-crud  ", expectedVersion);
    const created = mutationResult(await (await action("createProductAction", "/en/products", initial, authenticatedCookie)).text());
    expect(created).toMatchObject({ ok: true, product: { sku: "HTTP-CRUD", status: "ACTIVE" } });
    if (!created.ok) throw new Error("Authorized product creation failed.");
    expect(created.product).not.toHaveProperty("tenantId");
    const id = created.product.id;
    const updated = mutationResult(await (await action("updateProductAction", "/en/products", { ...initial, id, sku: "HTTP-CRUD-EDITED", name: "Updated database product", categoryCode: "custom/category", unitCode: "box" }, authenticatedCookie)).text());
    expect(updated).toMatchObject({ ok: true, product: { id, sku: "HTTP-CRUD-EDITED", categoryCode: "CUSTOM/CATEGORY", unitCode: "BOX", createdAt: created.product.createdAt } });
    if (!updated.ok) throw new Error("Authorized product update failed.");
    expect(Date.parse(updated.product.updatedAt)).toBeGreaterThanOrEqual(Date.parse(created.product.updatedAt));
    const page = await fetch(`${enabledServer.baseUrl}/en/products?search=HTTP-CRUD-EDITED`, { headers: { Cookie: authenticatedCookie } });
    expect(await page.text()).toContain("Updated database product");
    for (const [name, status] of [["archiveProductAction", "INACTIVE"], ["reactivateProductAction", "ACTIVE"]] as const) {
      const result = mutationResult(await (await action(name, "/en/products", { id, expectedVersion }, authenticatedCookie)).text());
      expect(result).toMatchObject({ ok: true, product: { id, status } });
    }
    const persisted = await pool.query<{ tenant_id: string; status: string; count: number }>("select tenant_id,status,count(*)::int count from products where tenant_id=$1 and id=$2 group by tenant_id,status", [memberTenantId, id]);
    expect(persisted.rows).toEqual([{ tenant_id: memberTenantId, status: "ACTIVE", count: 1 }]);
  });

  it("returns safe duplicate-SKU feedback for Unicode normalization collisions", async () => {
    if (!authenticatedCookie) throw new Error("Test fixture unavailable.");
    const input = productInput("HTTP-COLLISION", await currentVersion(authenticatedCookie));
    expect(mutationResult(await (await action("createProductAction", "/en/products", input, authenticatedCookie)).text())).toMatchObject({ ok: true });
    const collision = await action("createProductAction", "/en/products", { ...input, sku: "ｈｔｔｐ-ｃｏｌｌｉｓｉｏｎ" }, authenticatedCookie);
    const body = await collision.text();
    expect(mutationResult(body)).toEqual({ ok: false, code: "DUPLICATE_SKU" });
    expect(body).not.toContain("products_tenant_sku_unique");
    expect(body).not.toContain("postgresql://");
  });

  it("enforces database uniqueness for concurrent duplicate creation", async () => {
    if (!authenticatedCookie) throw new Error("Test fixture unavailable.");
    const input = productInput("HTTP-CONCURRENT", await currentVersion(authenticatedCookie));
    const responses = await Promise.all([action("createProductAction", "/en/products", input, authenticatedCookie), action("createProductAction", "/en/products", input, authenticatedCookie)]);
    const results = await Promise.all(responses.map(async (response) => mutationResult(await response.text())));
    expect(results.filter(({ ok }) => ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok && result.code === "DUPLICATE_SKU")).toHaveLength(1);
    const saved = await pool.query<{ count: number }>("select count(*)::int count from products where tenant_id=$1 and sku=$2", [memberTenantId, input.sku]);
    expect(saved.rows[0]?.count).toBe(1);
  });

  it("rejects unauthenticated, hostile-origin and forged-ownership Product actions", async () => {
    if (!authenticatedCookie) throw new Error("Test fixture unavailable.");
    const expectedVersion = await currentVersion(authenticatedCookie);
    const input = productInput("HTTP-REJECTED", expectedVersion);
    for (const name of ["createProductAction", "updateProductAction", "archiveProductAction", "reactivateProductAction"]) {
      const unauthenticated = await action(name, "/en/products", input, "");
      expect(mutationResult(await unauthenticated.text())).toEqual({ ok: false, code: "UNAUTHENTICATED" });
      const hostile = await action(name, "/en/products", input, authenticatedCookie, "https://hostile.example");
      expect(hostile.status).toBeGreaterThanOrEqual(400);
    }
    const forged = await action("createProductAction", "/en/products", { ...input, tenantId: privateTenantId, role: "OWNER" }, authenticatedCookie);
    expect(mutationResult(await forged.text())).toEqual({ ok: false, code: "INVALID_INPUT" });
    const saved = await pool.query<{ count: number }>("select count(*)::int count from products where tenant_id in ($1,$2) and sku=$3", [memberTenantId, privateTenantId, input.sku]);
    expect(saved.rows[0]?.count).toBe(0);
  });

  it("does not reveal or mutate a product from another tenant by forged UUID", async () => {
    if (!authenticatedCookie) throw new Error("Test fixture unavailable.");
    const foreign = await pool.query<{ id: string; name: string; status: string }>("select id,name,status from products where tenant_id=$1", [privateTenantId]);
    const original = foreign.rows[0]!;
    const input = { ...productInput("HTTP-CROSS-TENANT", await currentVersion(authenticatedCookie)), id: original.id };
    for (const [name, payload] of [
      ["updateProductAction", input],
      ["archiveProductAction", { id: input.id, expectedVersion: input.expectedVersion }],
      ["reactivateProductAction", { id: input.id, expectedVersion: input.expectedVersion }],
    ] as const) {
      const response = await action(name, "/en/products", payload, authenticatedCookie);
      const body = await response.text();
      expect(mutationResult(body)).toEqual({ ok: false, code: "NOT_FOUND" });
      expect(body).not.toContain(PRIVATE_PRODUCT_SKU);
    }
    const after = await pool.query<{ id: string; name: string; status: string }>("select id,name,status from products where tenant_id=$1", [privateTenantId]);
    expect(after.rows).toEqual(foreign.rows);
  });

  it("rejects a stale Products action after a real company switch", async () => {
    if (!enabledServer) throw new Error("Test fixture unavailable.");
    const cookie = await authenticate(enabledServer, false, "-product-stale");
    const identity = await identityFor(cookie);
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$3,'MANAGER'),($2,$3,'MANAGER')", [memberTenantId, privateTenantId, identity.user.id]);
    await pool.query("insert into session_tenant_context(session_id,tenant_id) values ($1,$2)", [identity.session.id, memberTenantId]);
    const switched = await action("selectCompanyAction", "/en/select-company", { tenantId: privateTenantId, expectedVersion: 1 }, cookie);
    expect(await switched.text()).toContain('"ok":true');
    const input = productInput("HTTP-STALE-MUST-NOT-EXIST", 1);
    const stale = await action("createProductAction", "/en/products", input, cookie);
    expect(mutationResult(await stale.text())).toEqual({ ok: false, code: "STALE_CONTEXT" });
    const saved = await pool.query<{ count: number }>("select count(*)::int count from products where tenant_id in ($1,$2) and sku=$3", [memberTenantId, privateTenantId, input.sku]);
    expect(saved.rows[0]?.count).toBe(0);
    const current = await readCatalog("", cookie);
    expect(current.data.map(({ sku }) => sku)).toContain(PRIVATE_PRODUCT_SKU);
    expect(current.data.map(({ sku }) => sku)).not.toContain(OWN_PRODUCT_SKU);
  });

  it.each(["revoked", "inactive-tenant", "invalid-context"] as const)("fails closed for %s on reads and product mutations", async (condition) => {
    if (!enabledServer) throw new Error("Test fixture unavailable.");
    const cookie = await authenticate(enabledServer, false, `-product-${condition}`);
    const identity = await identityFor(cookie);
    await pool.query("insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'MANAGER')", [memberTenantId, identity.user.id]);
    await pool.query("insert into session_tenant_context(session_id,tenant_id) values ($1,$2)", [identity.session.id, memberTenantId]);
    if (condition === "revoked") await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [memberTenantId, identity.user.id]);
    if (condition === "inactive-tenant") await pool.query("update tenants set status='INACTIVE' where id=$1", [memberTenantId]);
    if (condition === "invalid-context") await pool.query("update session_tenant_context set tenant_id=$1 where session_id=$2", [privateTenantId, identity.session.id]);
    try {
      const read = await fetch(`${enabledServer.baseUrl}/api/products`, { headers: { Cookie: cookie } });
      expect(read.status).toBe(403);
      expect(await read.text()).not.toContain(OWN_PRODUCT_SKU);
      const write = await action("createProductAction", "/en/products", productInput(`HTTP-${condition}`, await currentVersion(cookie)), cookie);
      expect(mutationResult(await write.text())).toEqual({ ok: false, code: "FORBIDDEN" });
      const page = await fetch(`${enabledServer.baseUrl}/ar/products`, { headers: { Cookie: cookie } });
      const body = await page.text();
      expect(body).not.toContain(OWN_PRODUCT_SKU);
      expect(body).not.toContain(PRIVATE_PRODUCT_SKU);
    } finally {
      if (condition === "inactive-tenant") await pool.query("update tenants set status='ACTIVE' where id=$1", [memberTenantId]);
    }
  });
});
