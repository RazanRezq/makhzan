import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/server/db/schema";
import { createAuthOptions } from "@/server/auth/options";
import type { auth as authInstance } from "@/server/auth/auth";
import type { databasePool as authDatabasePoolInstance } from "@/server/db";

const AUTH_BASE_URL = "http://auth.test.local";
const TEST_PASSWORD = "Correct-Horse-42!";
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(testDirectory, "../..");
const migrationsFolder = path.join(webRoot, "drizzle");

function requireSafeTestDatabaseUrl(value: string | undefined) {
  if (process.env.NODE_ENV !== "test" || !value) {
    throw new Error("Authentication tests require NODE_ENV=test and TEST_DATABASE_URL.");
  }

  const url = new URL(value);
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const allowedHosts = new Set(["127.0.0.1", "localhost", "postgres-test"]);
  if (
    (url.protocol !== "postgres:" && url.protocol !== "postgresql:") ||
    databaseName !== "makhzan_test" ||
    !allowedHosts.has(url.hostname)
  ) {
    throw new Error("Refusing to use a database outside the isolated auth test scope.");
  }

  return value;
}

const testDatabaseUrl = requireSafeTestDatabaseUrl(process.env.TEST_DATABASE_URL);
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = "synthetic-auth-test-secret-at-least-32-characters";
process.env.BETTER_AUTH_URL = AUTH_BASE_URL;
process.env.AUTH_TRUSTED_ORIGINS = AUTH_BASE_URL;

const pool = new Pool({ connectionString: testDatabaseUrl, max: 6 });
const database = drizzle({ client: pool, schema });
let auth: typeof authInstance;
let authDatabasePool: typeof authDatabasePoolInstance;

function authRequest(
  pathName: string,
  init: RequestInit = {},
  cookie?: string,
) {
  const headers = new Headers(init.headers);
  headers.set("Origin", AUTH_BASE_URL);
  if (cookie) headers.set("Cookie", cookie);
  if (init.body) headers.set("Content-Type", "application/json");

  return auth.handler(
    new Request(`${AUTH_BASE_URL}/api/auth${pathName}`, { ...init, headers }),
  );
}

function cookieHeader(response: Response) {
  const values = response.headers.getSetCookie();
  const cookies = values
    .map((value) => value.split(";", 1)[0])
    .filter((value): value is string => Boolean(value));
  if (cookies.length === 0) throw new Error("Authentication response set no cookie.");
  return cookies.join("; ");
}

async function signUp(email = "owner@example.test") {
  return authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({
      name: "Test Owner",
      email,
      password: TEST_PASSWORD,
    }),
  });
}

async function signIn(
  email = "owner@example.test",
  password = TEST_PASSWORD,
) {
  const response = await authRequest("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return { response, cookie: response.ok ? cookieHeader(response) : undefined };
}

beforeAll(async () => {
  await pool.query("drop schema if exists drizzle cascade");
  await pool.query("drop schema if exists public cascade");
  await pool.query("create schema public");
  await migrate(database, { migrationsFolder });

  ({ auth } = await import("@/server/auth/auth"));
  ({ databasePool: authDatabasePool } = await import("@/server/db"));
});

beforeEach(async () => {
  await pool.query(
    'truncate table "session", "account", "verification", "rate_limit", "user" cascade',
  );
});

afterAll(async () => {
  await authDatabasePool?.end();
  await pool.end();
});

describe("email and password registration", () => {
  it("registers a user with a Better Auth password hash and no automatic session", async () => {
    const response = await signUp();
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toBeNull();

    const users = await pool.query<{ email: string; name: string }>(
      'select email, name from "user"',
    );
    const accounts = await pool.query<{ password: string | null }>(
      'select password from "account" where provider_id = $1',
      ["credential"],
    );
    expect(users.rows).toEqual([
      { email: "owner@example.test", name: "Test Owner" },
    ]);
    expect(accounts.rows[0]?.password).toBeTruthy();
    expect(accounts.rows[0]?.password).not.toBe(TEST_PASSWORD);
  });

  it("rejects invalid registration input without writing a user", async () => {
    const response = await authRequest("/sign-up/email", {
      method: "POST",
      body: JSON.stringify({
        name: "A",
        email: "not-an-email",
        password: "short",
      }),
    });
    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);

    const result = await pool.query<{ count: string }>('select count(*) from "user"');
    expect(result.rows[0]?.count).toBe("0");
  });

  it("handles duplicate email registration without account enumeration", async () => {
    expect((await signUp()).status).toBe(200);
    const duplicate = await signUp();
    const body = await duplicate.text();

    expect(duplicate.status).toBe(200);
    expect(body).not.toContain(TEST_PASSWORD);
    expect(body.toLowerCase()).not.toContain("already registered");
    const result = await pool.query<{ count: string }>('select count(*) from "user"');
    expect(result.rows[0]?.count).toBe("1");
  });

  it("hard-disables the registration endpoint in a production environment", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_TEST_MODE", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://auth.example.test");

    try {
      const productionAuth = betterAuth({
        ...createAuthOptions(),
        database: drizzleAdapter(database, { provider: "pg", schema }),
      });
      const response = await productionAuth.handler(
        new Request(`${AUTH_BASE_URL}/api/auth/sign-up/email`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: AUTH_BASE_URL,
          },
          body: JSON.stringify({
            name: "Production User",
            email: "production@example.test",
            password: TEST_PASSWORD,
          }),
        }),
      );
      expect(response.status).toBe(404);
      const result = await pool.query<{ count: string }>('select count(*) from "user"');
      expect(result.rows[0]?.count).toBe("0");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("login and database-backed sessions", () => {
  it("logs in with valid credentials and creates a retrievable session", async () => {
    await signUp();
    const { response, cookie } = await signIn();
    expect(response.status).toBe(200);
    expect(cookie).toContain("makhzan.session_token=");

    const sessionResponse = await authRequest("/get-session", { method: "GET" }, cookie);
    const sessionBody: unknown = await sessionResponse.json();
    expect(sessionResponse.status).toBe(200);
    expect(sessionBody).toMatchObject({
      user: { email: "owner@example.test", name: "Test Owner" },
      session: { userId: expect.any(String) },
    });
    const stored = await pool.query<{ count: string }>('select count(*) from "session"');
    expect(stored.rows[0]?.count).toBe("1");
  });

  it("sets hardened session-cookie attributes in production", async () => {
    await signUp();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_TEST_MODE", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.test");
    vi.stubEnv("AUTH_TRUSTED_ORIGINS", "https://auth.example.test");

    try {
      const productionAuth = betterAuth({
        ...createAuthOptions(),
        database: drizzleAdapter(database, { provider: "pg", schema }),
      });
      const response = await productionAuth.handler(
        new Request("https://auth.example.test/api/auth/sign-in/email", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Origin: "https://auth.example.test",
          },
          body: JSON.stringify({
            email: "owner@example.test",
            password: TEST_PASSWORD,
          }),
        }),
      );
      const sessionCookie = response.headers
        .getSetCookie()
        .find((value) => value.includes("session_token"));

      expect(response.status).toBe(200);
      expect(sessionCookie).toContain("HttpOnly");
      expect(sessionCookie).toContain("Secure");
      expect(sessionCookie).toContain("SameSite=Lax");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("rejects an incorrect password without leaking credentials or internals", async () => {
    await signUp();
    const submittedPassword = "Definitely-Wrong-42!";
    const { response } = await signIn("owner@example.test", submittedPassword);
    const body = await response.text();

    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(body).not.toContain(submittedPassword);
    expect(body.toLowerCase()).not.toContain("password hash");
    expect(body.toLowerCase()).not.toContain("postgres");
  });

  it("rejects an expired database session", async () => {
    await signUp();
    const { cookie } = await signIn();
    await pool.query(
      'update "session" set expires_at = now() - interval \'1 minute\'',
    );

    const response = await authRequest("/get-session", { method: "GET" }, cookie);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("logs out, revokes the session, and clears session access", async () => {
    await signUp();
    const { cookie } = await signIn();
    const logout = await authRequest(
      "/sign-out",
      { method: "POST", body: JSON.stringify({}) },
      cookie,
    );
    expect(logout.status).toBe(200);
    expect(logout.headers.getSetCookie().some((cookie) =>
      cookie.includes("makhzan.session_token=") && cookie.includes("Max-Age=0"),
    )).toBe(true);

    const sessionResponse = await authRequest("/get-session", { method: "GET" }, cookie);
    expect(await sessionResponse.json()).toBeNull();
    const stored = await pool.query<{ count: string }>('select count(*) from "session"');
    expect(stored.rows[0]?.count).toBe("0");
  });
});

describe("authentication security boundaries", () => {
  it.each(["https://untrusted.example", undefined])(
    "rejects cookie-authenticated mutations with an untrusted or missing Origin (%s)",
    async (origin) => {
      await signUp();
      const { cookie } = await signIn();
      const headers = new Headers({ "Content-Type": "application/json", Cookie: cookie ?? "" });
      if (origin) headers.set("Origin", origin);
      const response = await auth.handler(new Request(`${AUTH_BASE_URL}/api/auth/sign-out`, {
        method: "POST", headers, body: "{}",
      }));
      expect(response.status).toBe(403);
      const stored = await pool.query<{ count: string }>('select count(*) from "session"');
      expect(stored.rows[0]?.count).toBe("1");
    },
  );

  it.each(["https://untrusted.example/account", "//untrusted.example/account"])(
    "rejects an external callback URL (%s)", async (callbackURL) => {
      await signUp();
      const response = await authRequest("/sign-in/email", {
        method: "POST",
        body: JSON.stringify({ email: "owner@example.test", password: TEST_PASSWORD, callbackURL }),
      });
      expect(response.status).toBe(403);
      expect(response.headers.get("location")).toBeNull();
      const stored = await pool.query<{ count: string }>('select count(*) from "session"');
      expect(stored.rows[0]?.count).toBe("0");
    },
  );

  it("rejects a modified session signature", async () => {
    await signUp();
    const { cookie } = await signIn();
    const response = await authRequest("/get-session", {}, `${cookie}tampered`);
    expect(response.status).toBe(200);
    expect(await response.json()).toBeNull();
  });

  it("uses the same generic error for an unknown email and incorrect password", async () => {
    await signUp();
    const known = await signIn("owner@example.test", "Incorrect-Password-42!");
    const unknown = await signIn("absent@example.test", "Incorrect-Password-42!");
    expect(known.response.status).toBe(401);
    expect(unknown.response.status).toBe(401);
    expect(await unknown.response.json()).toEqual(await known.response.json());
  });

  it("shares the five-attempt limit across auth instances and concurrent requests", async () => {
    await signUp();
    const otherInstance = betterAuth({
      ...createAuthOptions(),
      database: drizzleAdapter(database, { provider: "pg", schema }),
    });
    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => {
      const instance = index % 2 === 0 ? auth : otherInstance;
      return instance.handler(new Request(`${AUTH_BASE_URL}/api/auth/sign-in/email`, {
        method: "POST",
        headers: { Origin: AUTH_BASE_URL, "Content-Type": "application/json", "X-Forwarded-For": "192.0.2.10" },
        body: JSON.stringify({ email: "owner@example.test", password: "Incorrect-Password-42!" }),
      }));
    }));
    expect(responses.filter((response) => response.status === 401)).toHaveLength(5);
    const limited = responses.filter((response) => response.status === 429);
    expect(limited).toHaveLength(1);
    expect(Number(limited[0]?.headers.get("x-retry-after"))).toBeGreaterThan(0);
    const stored = await pool.query<{ count: number }>(
      'select count from "rate_limit" where key = $1', ["192.0.2.10|/sign-in/email"],
    );
    expect(stored.rows[0]?.count).toBe(5);
  });
});
