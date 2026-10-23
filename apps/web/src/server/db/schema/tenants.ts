import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { TENANT_STATUSES } from "@/lib/database/constants";
import type { TenantStatus } from "@/lib/database/constants";
import { sqlStringList } from "./shared";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<TenantStatus>()
      .notNull()
      .default("ACTIVE"),
    baseCurrency: varchar("base_currency", { length: 3 }).notNull(),
    timezone: varchar("timezone", { length: 64 })
      .notNull()
      .default("Asia/Dubai"),
    createdAt: timestamp("created_at", {
      withTimezone: true,
      precision: 3,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", {
      withTimezone: true,
      precision: 3,
      mode: "date",
    })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "tenants_name_canonical_check",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) > 0`,
    ),
    check(
      "tenants_status_check",
      sql`${table.status} in (${sqlStringList(TENANT_STATUSES)})`,
    ),
    check(
      "tenants_base_currency_check",
      sql`${table.baseCurrency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      "tenants_timezone_canonical_check",
      sql`${table.timezone} = btrim(${table.timezone}) and char_length(${table.timezone}) > 0`,
    ),
    check(
      "tenants_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("tenants_status_created_at_idx").on(
      table.status,
      table.createdAt.desc(),
      table.id,
    ),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
