import { spawn } from "node:child_process";
import { once } from "node:events";
import { rm, writeFile } from "node:fs/promises";
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

async function authenticate(server: RunningServer) {
  const email = `http-${process.pid}@example.test`;
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
  return cookies.join("; ");
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
});

afterAll(async () => {
  await Promise.all([stopServer(enabledServer), stopServer(disabledServer)]);
  await pool.end();
  await rm(distDirectory, { recursive: true, force: true });
  await rm(testTsconfigPath, { force: true });
});

describe("products HTTP contracts", () => {
  it("requires a valid session for the synthetic catalog API", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
      },
    });
  });

  it("serves the deterministic synthetic catalog to an authenticated user", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: authenticatedCookie ?? "" },
    });
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(body).toMatchObject({ meta: { count: 42, source: "synthetic-demo" } });

    if (
      typeof body !== "object" ||
      body === null ||
      !("data" in body) ||
      !Array.isArray(body.data)
    ) {
      throw new Error("Products response did not contain a data array.");
    }
    expect(body.data).toHaveLength(42);
    const ids = body.data.map((product: unknown) => {
      if (typeof product !== "object" || product === null || !("id" in product)) {
        throw new Error("Product response item did not contain an id.");
      }
      return product.id;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("rejects unsupported methods through the running Next.js server", async () => {
    const response = await fetch(`${enabledServer?.baseUrl}/api/products`, {
      method: "POST",
    });
    expect(response.status).toBe(405);
  });

  it("keeps the demo API disabled for authenticated users without explicit access", async () => {
    const response = await fetch(`${disabledServer?.baseUrl}/api/products`, {
      headers: { Cookie: authenticatedCookie ?? "" },
    });
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "DEMO_API_DISABLED",
        message: "The synthetic products API is disabled.",
      },
    });
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
      expect(html).not.toContain("BEV-WAT-001");
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
      expect(html).toContain("BEV-WAT-001");
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
