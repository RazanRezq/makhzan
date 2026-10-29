import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { TENANT_ROLES } from "@/lib/tenancy/permissions";
import type { TenantRole } from "@/lib/tenancy/permissions";
import { RESOURCE_STATUSES } from "@/lib/database/constants";
import type { ResourceStatus } from "@/lib/database/constants";
import { session, user } from "./auth";
import { tenants } from "./tenants";
import { sqlStringList } from "./shared";

const utcTimestamp = (name: string) =>
  timestamp(name, { withTimezone: true, precision: 3, mode: "date" })
    .notNull()
    .defaultNow();

export const tenantMemberships = pgTable(
  "tenant_memberships",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    role: varchar("role", { length: 16 }).$type<TenantRole>().notNull(),
    status: varchar("status", { length: 16 })
      .$type<ResourceStatus>()
      .notNull()
      .default("ACTIVE"),
    createdAt: utcTimestamp("created_at"),
    updatedAt: utcTimestamp("updated_at"),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    check(
      "tenant_memberships_role_check",
      sql`${table.role} in (${sqlStringList(TENANT_ROLES)})`,
    ),
    check(
      "tenant_memberships_status_check",
      sql`${table.status} in (${sqlStringList(RESOURCE_STATUSES)})`,
    ),
    check(
      "tenant_memberships_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("tenant_memberships_tenant_role_idx").on(
      table.tenantId,
      table.status,
      table.role,
    ),
    // Approved bootstrap exception: discovery is scoped to the authenticated user.
    index("tenant_memberships_user_status_idx").on(
      table.userId,
      table.status,
      table.tenantId,
    ),
  ],
);

export const sessionTenantContext = pgTable(
  "session_tenant_context",
  {
    sessionId: text("session_id")
      .primaryKey()
      .references(() => session.id, {
        onDelete: "cascade",
        onUpdate: "restrict",
      }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    version: integer("version").notNull().default(1),
    createdAt: utcTimestamp("created_at"),
    updatedAt: utcTimestamp("updated_at"),
  },
  (table) => [
    check("session_tenant_context_version_check", sql`${table.version} > 0`),
    check(
      "session_tenant_context_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("session_tenant_context_tenant_idx").on(
      table.tenantId,
      table.sessionId,
    ),
  ],
);

export const onboardingRequests = pgTable(
  "onboarding_requests",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    operationId: uuid("operation_id").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operationId] }),
    check(
      "onboarding_requests_fingerprint_check",
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("onboarding_requests_tenant_idx").on(table.tenantId, table.userId),
  ],
);

// Authentication-scoped attempt ledger, not tenant business data. Stable operation
// IDs make retries free even after a failed creation or an expired rate window.
export const tenantCreationRateLimits = pgTable(
  "tenant_creation_rate_limits",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    operationId: uuid("operation_id").notNull(),
    fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
    createdAt: utcTimestamp("created_at"),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.operationId] }),
    check(
      "tenant_creation_rate_limits_fingerprint_check",
      sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
    index("tenant_creation_rate_limits_user_created_idx").on(
      table.userId,
      table.createdAt,
    ),
  ],
);
