import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { TenantRole } from "@/lib/tenancy/permissions";

const url = process.env.TEST_DATABASE_URL;
if (!url || process.env.NODE_ENV !== "test")
  throw new Error("Tenancy tests require NODE_ENV=test and TEST_DATABASE_URL.");
const parsedUrl = new URL(url);
if (
  !["postgres:", "postgresql:"].includes(parsedUrl.protocol) ||
  !["localhost", "127.0.0.1", "postgres-test"].includes(parsedUrl.hostname) ||
  decodeURIComponent(parsedUrl.pathname.slice(1)) !== "makhzan_test"
) {
  throw new Error(
    "Refusing to reset a database outside the isolated tenancy test scope.",
  );
}
const BASE = "http://tenancy.test.local";
const PASSWORD = "Synthetic-Tenancy-Password-42!";
process.env.DATABASE_URL = url;
process.env.BETTER_AUTH_SECRET =
  "synthetic-tenancy-test-secret-at-least-32-characters";
process.env.BETTER_AUTH_URL = BASE;
process.env.AUTH_TRUSTED_ORIGINS = BASE;

const pool = new Pool({ connectionString: url, max: 8 });
const database = drizzle(pool);
const folder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);
let auth: typeof import("@/server/auth/auth").auth;
let appPool: typeof import("@/server/db").databasePool;
let createCompany: typeof import("@/server/tenants/onboarding.service").createFirstCompany;
let choose: typeof import("@/server/tenants/context.service").selectCompany;
let access: typeof import("@/server/tenants/context.service").getCompanyAccess;
let enter: typeof import("@/server/tenants/context.service").resolveCompanyEntry;
let authorize: typeof import("@/server/tenants/security").authorizeTenant;
let updateMember: typeof import("@/server/tenants/membership.service").updateMembership;
const people: {
  id: string;
  headers: Headers;
  sessionId: string;
  email: string;
}[] = [];
let preservedLegacy = false;

function companyInput() {
  return {
    name: "Test Company",
    baseCurrency: "AED",
    timezone: "Asia/Dubai",
    operationId: randomUUID(),
  };
}

async function authPost(endpoint: string, body: object) {
  return auth.handler(
    new Request(`${BASE}/api/auth/${endpoint}`, {
      method: "POST",
      headers: { Origin: BASE, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

async function fixtureTenant(
  personIndex = 0,
  role: TenantRole = "OWNER",
  name = "Private Company A",
) {
  const tenant = await pool.query<{ id: string }>(
    "insert into tenants(name, base_currency) values ($1, 'AED') returning id",
    [name],
  );
  const tenantId = tenant.rows[0]!.id;
  await member(tenantId, personIndex, role);
  await choose(people[personIndex]!.headers, { tenantId, expectedVersion: 0 });
  return tenantId;
}

async function member(
  tenantId: string,
  personIndex: number,
  role: TenantRole = "OWNER",
) {
  await pool.query(
    "insert into tenant_memberships(tenant_id, user_id, role) values ($1,$2,$3)",
    [tenantId, people[personIndex]!.id, role],
  );
}

async function rejectMembershipWrites(table = "tenant_memberships") {
  await pool.query(`create or replace function reject_test_membership() returns trigger language plpgsql as $$
    begin raise exception 'synthetic membership failure'; end; $$`);
  if (
    ![
      "tenant_memberships",
      "session_tenant_context",
      "onboarding_requests",
    ].includes(table)
  )
    throw new Error("Invalid test table.");
  await pool.query(
    `create trigger test_reject_membership before insert on ${table} for each row execute function reject_test_membership()`,
  );
}

async function counts() {
  const result = await pool.query<{
    tenants: number;
    members: number;
    contexts: number;
    receipts: number;
    attempts: number;
  }>(
    `select (select count(*)::int from tenants) tenants, (select count(*)::int from tenant_memberships) members,
     (select count(*)::int from session_tenant_context) contexts, (select count(*)::int from onboarding_requests) receipts,
     (select count(*)::int from tenant_creation_rate_limits) attempts`,
  );
  return result.rows[0]!;
}

beforeAll(async () => {
  await pool.query(
    "drop schema if exists drizzle cascade; drop schema if exists public cascade; create schema public",
  );
  // Exercise a real migration upgrade: install committed Group B migrations,
  // retain business records, then apply the complete current journal.
  const legacy = await mkdtemp(path.join(tmpdir(), "makhzan-legacy-"));
  try {
    await mkdir(path.join(legacy, "meta"));
    const journal = JSON.parse(
      await readFile(path.join(folder, "meta/_journal.json"), "utf8"),
    ) as { entries: { idx: number; tag: string }[] };
    const entries = journal.entries.filter(({ idx }) => idx <= 2);
    await writeFile(
      path.join(legacy, "meta/_journal.json"),
      JSON.stringify({ ...journal, entries }),
    );
    for (const entry of entries)
      await writeFile(
        path.join(legacy, `${entry.tag}.sql`),
        await readFile(path.join(folder, `${entry.tag}.sql`)),
      );
    await migrate(database, { migrationsFolder: legacy });
    const old = await pool.query<{ id: string }>(
      "insert into tenants(name,base_currency) values ('Preserved legacy company','AED') returning id",
    );
    await pool.query(
      "insert into products(tenant_id,sku,name,category_code,unit_code) values ($1,'LEGACY-SKU','Preserved product','GENERAL','UNIT')",
      [old.rows[0]!.id],
    );
    await migrate(database, { migrationsFolder: folder });
    const retained = await pool.query<{ sku: string }>(
      "select sku from products where tenant_id=$1",
      [old.rows[0]!.id],
    );
    const members = await pool.query<{ count: number }>(
      "select count(*)::int count from tenant_memberships where tenant_id=$1",
      [old.rows[0]!.id],
    );
    preservedLegacy =
      retained.rows[0]?.sku === "LEGACY-SKU" && members.rows[0]?.count === 0;
  } finally {
    await rm(legacy, { recursive: true, force: true });
  }

  ({ auth } = await import("@/server/auth/auth"));
  ({ databasePool: appPool } = await import("@/server/db"));
  ({ createFirstCompany: createCompany } =
    await import("@/server/tenants/onboarding.service"));
  ({ selectCompany: choose, getCompanyAccess: access, resolveCompanyEntry: enter } =
    await import("@/server/tenants/context.service"));
  ({ authorizeTenant: authorize } = await import("@/server/tenants/security"));
  ({ updateMembership: updateMember } =
    await import("@/server/tenants/membership.service"));
  for (let i = 0; i < 4; i++) {
    const email = `tenancy-${i}@example.test`;
    const registration = await authPost("sign-up/email", {
      name: `Test person ${i}`,
      email,
      password: PASSWORD,
    });
    expect(registration.status).toBe(200);
    const found = await pool.query<{ id: string }>(
      'select id from "user" where email=$1',
      [email],
    );
    people.push({
      id: found.rows[0]!.id,
      email,
      sessionId: "",
      headers: new Headers(),
    });
  }
});

beforeEach(async () => {
  await pool.query(
    "drop trigger if exists test_reject_membership on tenant_memberships",
  );
  await pool.query(
    "drop trigger if exists test_reject_membership on session_tenant_context",
  );
  await pool.query(
    "drop trigger if exists test_reject_membership on onboarding_requests",
  );
  await pool.query(
    'truncate tenants, tenant_creation_rate_limits, "session", rate_limit cascade',
  );
  for (const person of people) {
    const login = await authPost("sign-in/email", {
      email: person.email,
      password: PASSWORD,
    });
    expect(login.status).toBe(200);
    const cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";", 1)[0])
      .join("; ");
    person.headers = new Headers({ Cookie: cookie, Origin: BASE });
    const row = await pool.query<{ id: string }>(
      'select id from "session" where user_id=$1',
      [person.id],
    );
    person.sessionId = row.rows[0]!.id;
  }
});

afterAll(async () => {
  await appPool?.end();
  await pool.end();
});

describe("migration and database integrity", () => {
  it("upgrades Group B without changing business records or assigning legacy owners", () =>
    expect(preservedLegacy).toBe(true));

  it("enforces duplicate membership, role/status, and reference constraints", async () => {
    const tenantId = await fixtureTenant();
    await expect(member(tenantId, 0)).rejects.toMatchObject({ code: "23505" });
    await expect(
      pool.query(
        "update tenant_memberships set role='ROOT' where tenant_id=$1",
        [tenantId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "update tenant_memberships set status='UNKNOWN' where tenant_id=$1",
        [tenantId],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query('delete from "user" where id=$1', [people[0]!.id]),
    ).rejects.toMatchObject({ code: "23503" });
    await expect(
      pool.query(
        "insert into tenant_memberships(tenant_id,user_id,role) values ($1,$2,'VIEWER')",
        [randomUUID(), people[1]!.id],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("preserves membership created_at and advances context versions at the database boundary", async () => {
    const tenantId = await fixtureTenant();
    const original = await pool.query<{ created_at: Date; updated_at: Date }>(
      "select created_at,updated_at from tenant_memberships where tenant_id=$1",
      [tenantId],
    );
    const updated = await pool.query<{ created_at: Date; updated_at: Date }>(
      "update tenant_memberships set created_at='2000-01-01',updated_at='2000-01-01' where tenant_id=$1 returning created_at,updated_at",
      [tenantId],
    );
    expect(updated.rows[0]!.created_at).toEqual(original.rows[0]!.created_at);
    expect(updated.rows[0]!.updated_at.getTime()).toBeGreaterThanOrEqual(
      original.rows[0]!.updated_at.getTime(),
    );
    const context = await pool.query<{ version: number }>(
      "update session_tenant_context set version=1 where session_id=$1 returning version",
      [people[0]!.sessionId],
    );
    expect(context.rows[0]!.version).toBe(2);
  });
});

describe("atomic first-company onboarding", () => {
  it("creates a tenant, OWNER, context, and receipt in one successful operation", async () => {
    const result = await createCompany(people[0]!.headers, companyInput());
    expect(await counts()).toEqual({
      tenants: 1,
      members: 1,
      contexts: 1,
      receipts: 1,
      attempts: 1,
    });
    expect(await authorize(people[0]!.headers, "dashboard.read")).toMatchObject(
      { tenantId: result.tenantId, role: "OWNER", version: 1 },
    );
  });

  it("rejects unauthenticated creation without writing any state", async () => {
    await expect(
      createCompany(new Headers({ Origin: BASE }), companyInput()),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect((await counts()).tenants).toBe(0);
  });

  it.each([undefined, "https://hostile.example"])(
    "rejects a missing or hostile mutation origin (%s)",
    async (origin) => {
      const headers = new Headers(people[0]!.headers);
      headers.delete("origin");
      if (origin) headers.set("origin", origin);
      await expect(
        createCompany(headers, companyInput()),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("rejects injected roles, users, and tenant IDs", async () => {
    for (const extra of [
      { role: "OWNER" },
      { userId: people[1]!.id },
      { tenantId: randomUUID() },
    ]) {
      await expect(
        createCompany(people[0]!.headers, { ...companyInput(), ...extra }),
      ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    }
    expect((await counts()).tenants).toBe(0);
  });

  it("replays concurrent retries without consuming extra attempts", async () => {
    const input = companyInput();
    const results = await Promise.all(
      Array.from({ length: 6 }, () => createCompany(people[0]!.headers, input)),
    );
    expect(new Set(results.map(({ tenantId }) => tenantId)).size).toBe(1);
    expect(await counts()).toEqual({
      tenants: 1,
      members: 1,
      contexts: 1,
      receipts: 1,
      attempts: 1,
    });
  });

  it("serializes distinct operation IDs for the same user across sessions", async () => {
    const another = await authPost("sign-in/email", {
      email: people[0]!.email,
      password: PASSWORD,
    });
    const headers = new Headers({
      Origin: BASE,
      Cookie: another.headers
        .getSetCookie()
        .map((v) => v.split(";", 1)[0])
        .join("; "),
    });
    const results = await Promise.allSettled([
      createCompany(people[0]!.headers, companyInput()),
      createCompany(headers, companyInput()),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
    expect((await counts()).tenants).toBe(1);
    expect((await counts()).attempts).toBe(1);
  });

  it("rolls back all company writes when membership creation fails and keeps retries free", async () => {
    await rejectMembershipWrites();
    const input = companyInput();
    for (let i = 0; i < 3; i++)
      await expect(
        createCompany(people[0]!.headers, input),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(await counts()).toEqual({
      tenants: 0,
      members: 0,
      contexts: 0,
      receipts: 0,
      attempts: 1,
    });
    await pool.query(
      "drop trigger test_reject_membership on tenant_memberships",
    );
    await createCompany(people[0]!.headers, input);
    expect((await counts()).attempts).toBe(1);
  });

  it("rate-limits distinct failed operations across concurrent requests", async () => {
    await rejectMembershipWrites();
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        createCompany(people[0]!.headers, companyInput()),
      ),
    );
    const reasons = results
      .filter((result) => result.status === "rejected")
      .map((result) => result.reason as { code: string });
    expect(reasons.filter(({ code }) => code === "RATE_LIMITED")).toHaveLength(
      1,
    );
    expect((await counts()).attempts).toBe(5);
    expect((await counts()).tenants).toBe(0);
  });

  it.each(["session_tenant_context", "onboarding_requests"])(
    "rolls back every company write when %s insertion fails",
    async (table) => {
      await rejectMembershipWrites(table);
      await expect(
        createCompany(people[0]!.headers, companyInput()),
      ).rejects.toMatchObject({ code: "UNAVAILABLE" });
      expect(await counts()).toEqual({
        tenants: 0,
        members: 0,
        contexts: 0,
        receipts: 0,
        attempts: 1,
      });
    },
  );

  it("keeps a correct failed retry free after the rate window expires", async () => {
    await rejectMembershipWrites();
    const input = companyInput();
    await expect(
      createCompany(people[0]!.headers, input),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await pool.query(
      "update tenant_creation_rate_limits set created_at=now()-interval '11 minutes' where user_id=$1",
      [people[0]!.id],
    );
    await expect(
      createCompany(people[0]!.headers, input),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect((await counts()).attempts).toBe(1);
    await expect(
      createCompany(people[0]!.headers, companyInput()),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect((await counts()).attempts).toBe(2);
  });

  it("rejects operation-key reuse with changed details after success or failure", async () => {
    const input = companyInput();
    await rejectMembershipWrites();
    await expect(
      createCompany(people[0]!.headers, input),
    ).rejects.toMatchObject({ code: "UNAVAILABLE" });
    await expect(
      createCompany(people[0]!.headers, { ...input, name: "Different" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await pool.query(
      "drop trigger test_reject_membership on tenant_memberships",
    );
    await createCompany(people[0]!.headers, input);
    await expect(
      createCompany(people[0]!.headers, { ...input, name: "Different" }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it.each(["ACTIVE", "INACTIVE"])(
    "blocks new creation for an existing %s membership",
    async (status) => {
      const tenantId = await fixtureTenant();
      await pool.query(
        "update tenant_memberships set status=$1 where tenant_id=$2",
        [status, tenantId],
      );
      await expect(
        createCompany(people[0]!.headers, companyInput()),
      ).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
      expect((await access(people[0]!.headers)).canOnboard).toBe(false);
    },
  );

  it("does not reset a newer company selection when an onboarding result is retried", async () => {
    const input = companyInput();
    await createCompany(people[0]!.headers, input);
    const other = await fixtureTenant(1, "OWNER", "Private Company B");
    await member(other, 0, "VIEWER");
    await choose(people[0]!.headers, { tenantId: other, expectedVersion: 1 });
    await createCompany(people[0]!.headers, input);
    expect(await authorize(people[0]!.headers, "dashboard.read")).toMatchObject(
      { tenantId: other, version: 2 },
    );
  });
});

describe("active tenant isolation and revocation", () => {
  it("requires onboarding for a user with no company, without assigning a legacy tenant", async () => {
    await fixtureTenant(1);
    expect(await access(people[0]!.headers)).toMatchObject({
      canOnboard: true,
      companies: [],
      activeTenantId: null,
    });
    await expect(
      authorize(people[0]!.headers, "dashboard.read"),
    ).rejects.toMatchObject({ code: "NO_TENANT" });
  });

  it("keeps discovery read-only even with exactly one eligible company", async () => {
    const other = await fixtureTenant(1);
    await member(other, 0, "VIEWER");
    const own = await access(people[0]!.headers);
    expect(own.companies).toHaveLength(1);
    expect(own.activeTenantId).toBeNull();
    await expect(
      authorize(people[0]!.headers, "dashboard.read"),
    ).rejects.toMatchObject({ code: "NO_TENANT" });
  });

  it("rejects forged selectors and does not disclose another company's details", async () => {
    const own = await fixtureTenant();
    const other = await fixtureTenant(1, "OWNER", "Private Company B");
    await expect(
      choose(people[0]!.headers, { tenantId: other, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(JSON.stringify(await access(people[0]!.headers))).not.toContain(
      "Private Company B",
    );
    expect(await authorize(people[0]!.headers, "dashboard.read")).toMatchObject(
      { tenantId: own, name: "Private Company A" },
    );
  });

  it("denies a context that names a tenant without a matching membership", async () => {
    await fixtureTenant();
    const other = await fixtureTenant(1);
    await pool.query(
      "update session_tenant_context set tenant_id=$1 where session_id=$2",
      [other, people[0]!.sessionId],
    );
    await expect(
      authorize(people[0]!.headers, "dashboard.read"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rejects stale-tab mutations after a valid company switch", async () => {
    const first = await fixtureTenant();
    const second = await fixtureTenant(1);
    await member(second, 0, "OWNER");
    await choose(people[0]!.headers, { tenantId: second, expectedVersion: 1 });
    await expect(
      updateMember(people[0]!.headers, {
        targetUserId: people[1]!.id,
        role: "VIEWER",
        status: "ACTIVE",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "STALE_CONTEXT" });
    const context = await authorize(people[0]!.headers, "dashboard.read");
    expect(context.tenantId).toBe(second);
    expect(context.tenantId).not.toBe(first);
    expect(context.version).toBe(2);
  });

  it("serializes competing selections and rejects the losing stale version", async () => {
    const first = await fixtureTenant();
    const second = await fixtureTenant(1);
    await member(second, 0);
    const results = await Promise.allSettled([
      choose(people[0]!.headers, { tenantId: first, expectedVersion: 1 }),
      choose(people[0]!.headers, { tenantId: second, expectedVersion: 1 }),
    ]);
    expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(
      1,
    );
  });

  it.each(["membership", "tenant"])(
    "fails closed after %s becomes inactive",
    async (target) => {
      const tenantId = await fixtureTenant();
      if (target === "tenant")
        await pool.query("update tenants set status='INACTIVE' where id=$1", [
          tenantId,
        ]);
      else
        await pool.query(
          "update tenant_memberships set status='INACTIVE' where tenant_id=$1",
          [tenantId],
        );
      await expect(
        authorize(people[0]!.headers, "dashboard.read"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await access(people[0]!.headers)).companies).toHaveLength(0);
      await expect(
        choose(people[0]!.headers, { tenantId, expectedVersion: 1 }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("rejects an expired session even when a context row still exists", async () => {
    await fixtureTenant();
    await pool.query(
      "update \"session\" set expires_at=now()-interval '1 minute' where id=$1",
      [people[0]!.sessionId],
    );
    await expect(
      authorize(people[0]!.headers, "dashboard.read"),
    ).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rechecks membership after waiting for a concurrent revocation transaction", async () => {
    const tenantId = await fixtureTenant();
    const revocation = await pool.connect();
    let waiting: Promise<unknown> | undefined;
    try {
      await revocation.query("begin");
      await revocation.query("select id from tenants where id=$1 for update", [
        tenantId,
      ]);
      waiting = authorize(people[0]!.headers, "dashboard.read");
      // Attach the rejection handler before releasing the competing transaction.
      const denied = expect(waiting).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      await revocation.query(
        "update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2",
        [tenantId, people[0]!.id],
      );
      await revocation.query("commit");
      await denied;
    } finally {
      await revocation.query("rollback");
      revocation.release();
    }
  });
});

describe("secure single-company entry", () => {
  it("sends zero memberships to onboarding without claiming a company", async () => {
    await fixtureTenant(1);
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/onboarding" });
    expect((await access(people[0]!.headers)).contextVersion).toBe(0);
  });

  it("selects the only eligible membership without elevating its role", async () => {
    const tenantId = await fixtureTenant(1);
    await member(tenantId, 0, "VIEWER");
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/" });
    expect(await authorize(people[0]!.headers, "dashboard.read")).toMatchObject({
      tenantId, role: "VIEWER", version: 1,
    });
    await expect(authorize(people[0]!.headers, "inventory.adjust"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps refreshes and concurrent repeated entry free of context updates", async () => {
    const tenantId = await fixtureTenant(1);
    await member(tenantId, 0);
    await Promise.all(Array.from({ length: 4 }, () => enter(people[0]!.headers)));
    const before = await pool.query("select * from session_tenant_context where session_id=$1", [people[0]!.sessionId]);
    for (let i = 0; i < 3; i++) {
      await access(people[0]!.headers);
      await enter(people[0]!.headers);
    }
    const after = await pool.query("select * from session_tenant_context where session_id=$1", [people[0]!.sessionId]);
    expect(after.rows).toEqual(before.rows);
    expect(after.rows[0].version).toBe(1);
  });

  it("never chooses arbitrarily between multiple memberships", async () => {
    await member(await fixtureTenant(1), 0);
    await member(await fixtureTenant(2), 0, "VIEWER");
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/select-company" });
    expect((await access(people[0]!.headers)).contextVersion).toBe(0);
  });

  it("preserves a valid selection when multiple companies are eligible", async () => {
    const selected = await fixtureTenant();
    await member(await fixtureTenant(1), 0, "VIEWER");
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/" });
    expect(await authorize(people[0]!.headers, "dashboard.read"))
      .toMatchObject({ tenantId: selected, version: 1 });
  });

  it.each(["membership", "tenant"])("never falls back after selected %s becomes inactive", async (kind) => {
    const selected = await fixtureTenant();
    await member(await fixtureTenant(1), 0, "VIEWER");
    if (kind === "membership")
      await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [selected, people[0]!.id]);
    else await pool.query("update tenants set status='INACTIVE' where id=$1", [selected]);
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/select-company" });
    expect(await access(people[0]!.headers)).toMatchObject({
      activeTenantId: null, selectionUnavailable: true, needsAutoSelection: false, contextVersion: 1,
    });
    const result = await pool.query("select tenant_id from session_tenant_context where session_id=$1", [people[0]!.sessionId]);
    expect(result.rows[0].tenant_id).toBe(selected);
    await expect(authorize(people[0]!.headers, "dashboard.read"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("does not replace a forged/invalid stored context with the only eligible company", async () => {
    await fixtureTenant();
    const foreign = await fixtureTenant(1);
    await pool.query("update session_tenant_context set tenant_id=$1 where session_id=$2", [foreign, people[0]!.sessionId]);
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/select-company" });
    expect((await access(people[0]!.headers)).selectionUnavailable).toBe(true);
  });

  it.each(["membership", "tenant"])("excludes inactive %s and routes to safe onboarding without enabling company creation", async (kind) => {
    const only = await fixtureTenant(1);
    await member(only, 0);
    if (kind === "membership")
      await pool.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [only, people[0]!.id]);
    else await pool.query("update tenants set status='INACTIVE' where id=$1", [only]);
    expect(await enter(people[0]!.headers)).toEqual({ destination: "/onboarding" });
    expect(await access(people[0]!.headers)).toMatchObject({ canOnboard: false, contextVersion: 0 });
    await expect(createCompany(people[0]!.headers, companyInput()))
      .rejects.toMatchObject({ code: "ALREADY_MEMBER" });
  });

  it("revalidates membership after waiting on a concurrent revocation", async () => {
    const only = await fixtureTenant(1);
    await member(only, 0);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select id from tenants where id=$1 for update", [only]);
      await client.query("update tenant_memberships set status='INACTIVE' where tenant_id=$1 and user_id=$2", [only, people[0]!.id]);
      const pending = enter(people[0]!.headers);
      await client.query("commit");
      expect(await pending).toEqual({ destination: "/onboarding" });
      expect((await access(people[0]!.headers)).contextVersion).toBe(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("requires authentication and trusted mutation origin", async () => {
    await expect(enter(new Headers({ Origin: BASE }))).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    for (const origin of [undefined, "https://hostile.example"]) {
      const headers = new Headers(people[0]!.headers);
      if (origin) headers.set("Origin", origin);
      else headers.delete("Origin");
      await expect(enter(headers)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await pool.query('update "session" set expires_at=now()-interval \'1 hour\' where id=$1', [people[0]!.sessionId]);
    await expect(enter(people[0]!.headers)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });
});

describe("server RBAC and OWNER invariants", () => {
  it.each(["MANAGER", "STAFF", "VIEWER"] as const)(
    "prevents %s self-escalation and member administration",
    async (role) => {
      await fixtureTenant(0, role);
      await expect(
        updateMember(people[0]!.headers, {
          targetUserId: people[0]!.id,
          role: "OWNER",
          status: "ACTIVE",
          expectedVersion: 1,
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        authorize(people[0]!.headers, "tenantSettings.update"),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    },
  );

  it("rejects VIEWER writes while permitting tenant-scoped reads", async () => {
    const tenantId = await fixtureTenant(0, "VIEWER");
    expect(await authorize(people[0]!.headers, "products.read")).toMatchObject({
      tenantId,
    });
    await expect(
      authorize(people[0]!.headers, "inventory.adjust"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lets OWNER change a current-tenant member and denies cross-tenant modifications", async () => {
    const tenantId = await fixtureTenant();
    await member(tenantId, 2, "VIEWER");
    await choose(people[2]!.headers, { tenantId, expectedVersion: 0 });
    await expect(
      authorize(people[2]!.headers, "inventory.adjust"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateMember(people[0]!.headers, {
      targetUserId: people[2]!.id,
      role: "STAFF",
      status: "ACTIVE",
      expectedVersion: 1,
    });
    // The same authenticated session must observe both promotion and demotion,
    // without logging in again or refreshing a cached role.
    expect(await authorize(people[2]!.headers, "inventory.adjust")).toMatchObject({
      tenantId, role: "STAFF",
    });
    await updateMember(people[0]!.headers, {
      targetUserId: people[2]!.id,
      role: "VIEWER",
      status: "ACTIVE",
      expectedVersion: 1,
    });
    await expect(
      authorize(people[2]!.headers, "inventory.adjust"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const other = await fixtureTenant(1);
    await expect(
      updateMember(people[0]!.headers, {
        targetUserId: people[1]!.id,
        role: "VIEWER",
        status: "ACTIVE",
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const untouched = await pool.query<{ role: string }>(
      "select role from tenant_memberships where tenant_id=$1 and user_id=$2",
      [other, people[1]!.id],
    );
    expect(untouched.rows[0]!.role).toBe("OWNER");
  });

  it.each([
    { role: "VIEWER", status: "ACTIVE" },
    { role: "OWNER", status: "INACTIVE" },
  ] as const)("protects the final active OWNER (%j)", async (change) => {
    await fixtureTenant();
    await expect(
      updateMember(people[0]!.headers, {
        targetUserId: people[0]!.id,
        ...change,
        expectedVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "FINAL_OWNER" });
  });

  it("retains an OWNER under concurrent demotions from separate owners", async () => {
    const tenantId = await fixtureTenant();
    await member(tenantId, 1);
    await choose(people[1]!.headers, { tenantId, expectedVersion: 0 });
    for (const change of [
      { role: "VIEWER", status: "ACTIVE" },
      { role: "OWNER", status: "INACTIVE" },
    ] as const) {
      await pool.query(
        "update tenant_memberships set role='OWNER', status='ACTIVE' where tenant_id=$1",
        [tenantId],
      );
      const results = await Promise.allSettled(
        [0, 1].map((index) =>
          updateMember(people[index]!.headers, {
            targetUserId: people[index]!.id,
            ...change,
            expectedVersion: 1,
          }),
        ),
      );
      expect(results.filter(({ status }) => status === "fulfilled")).toHaveLength(1);
      const remaining = await pool.query<{ count: number }>(
        "select count(*)::int count from tenant_memberships where tenant_id=$1 and role='OWNER' and status='ACTIVE'",
        [tenantId],
      );
      expect(remaining.rows[0]!.count).toBe(1);
    }
  });

  it("observes membership revocation immediately on the next protected operation", async () => {
    const tenantId = await fixtureTenant();
    await member(tenantId, 1, "VIEWER");
    await choose(people[1]!.headers, { tenantId, expectedVersion: 0 });
    await authorize(people[1]!.headers, "dashboard.read");
    await updateMember(people[0]!.headers, {
      targetUserId: people[1]!.id,
      role: "VIEWER",
      status: "INACTIVE",
      expectedVersion: 1,
    });
    await expect(
      authorize(people[1]!.headers, "dashboard.read"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
