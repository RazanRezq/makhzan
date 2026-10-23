import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  timestamp,
  unique,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { RESOURCE_STATUSES } from "@/lib/database/constants";
import type { ResourceStatus } from "@/lib/database/constants";
import { sqlStringList } from "./shared";
import { tenants } from "./tenants";

export const warehouses = pgTable(
  "warehouses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    status: varchar("status", { length: 16 })
      .$type<ResourceStatus>()
      .notNull()
      .default("ACTIVE"),
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
    unique("warehouses_tenant_code_unique").on(table.tenantId, table.code),
    unique("warehouses_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "warehouses_code_check",
      sql`${table.code} ~ '^[A-Z0-9][A-Z0-9._/-]*$'`,
    ),
    check(
      "warehouses_name_canonical_check",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) > 0`,
    ),
    check(
      "warehouses_status_check",
      sql`${table.status} in (${sqlStringList(RESOURCE_STATUSES)})`,
    ),
    check(
      "warehouses_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("warehouses_tenant_name_idx").on(
      table.tenantId,
      table.name,
      table.id,
    ),
  ],
);

export type Warehouse = typeof warehouses.$inferSelect;
export type NewWarehouse = typeof warehouses.$inferInsert;
