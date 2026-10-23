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
import {
  CATEGORY_CODE_MAX_LENGTH,
  SKU_MAX_LENGTH,
  UNIT_CODE_MAX_LENGTH,
} from "@/lib/products/product-codes";
import { sqlStringList } from "./shared";
import { tenants } from "./tenants";

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, {
        onDelete: "restrict",
        onUpdate: "restrict",
      }),
    sku: varchar("sku", { length: SKU_MAX_LENGTH }).notNull(),
    name: varchar("name", { length: 200 }).notNull(),
    categoryCode: varchar("category_code", {
      length: CATEGORY_CODE_MAX_LENGTH,
    }).notNull(),
    unitCode: varchar("unit_code", { length: UNIT_CODE_MAX_LENGTH }).notNull(),
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
    unique("products_tenant_sku_unique").on(table.tenantId, table.sku),
    unique("products_tenant_id_unique").on(table.tenantId, table.id),
    check(
      "products_sku_length_check",
      sql`char_length(${table.sku}) between 1 and ${sql.raw(String(SKU_MAX_LENGTH))}`,
    ),
    check(
      "products_sku_canonical_check",
      sql`octet_length(${table.sku}) = char_length(${table.sku})
        and ${table.sku} = upper(${table.sku})
        and ${table.sku} = btrim(${table.sku})
        and ${table.sku} !~ '[[:cntrl:]]'
        and ${table.sku} !~ '  '`,
    ),
    check(
      "products_name_canonical_check",
      sql`${table.name} = btrim(${table.name}) and char_length(${table.name}) > 0`,
    ),
    check(
      "products_category_code_check",
      sql`${table.categoryCode} ~ '^[A-Z0-9][A-Z0-9._/-]*$'`,
    ),
    check(
      "products_unit_code_check",
      sql`${table.unitCode} ~ '^[A-Z0-9][A-Z0-9._/-]*$'`,
    ),
    check(
      "products_status_check",
      sql`${table.status} in (${sqlStringList(RESOURCE_STATUSES)})`,
    ),
    check(
      "products_timestamps_check",
      sql`${table.updatedAt} >= ${table.createdAt}`,
    ),
    index("products_tenant_created_at_idx").on(
      table.tenantId,
      table.createdAt.desc(),
      table.id,
    ),
  ],
);

export type DatabaseProduct = typeof products.$inferSelect;
export type NewDatabaseProduct = typeof products.$inferInsert;
