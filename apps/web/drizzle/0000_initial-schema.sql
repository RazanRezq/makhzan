CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"sku" varchar(64) NOT NULL,
	"name" varchar(200) NOT NULL,
	"category_code" varchar(64) NOT NULL,
	"unit_code" varchar(32) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_tenant_sku_unique" UNIQUE("tenant_id","sku"),
	CONSTRAINT "products_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "products_sku_length_check" CHECK (char_length("products"."sku") between 1 and 64),
	CONSTRAINT "products_sku_canonical_check" CHECK (octet_length("products"."sku") = char_length("products"."sku")
        and "products"."sku" = upper("products"."sku")
        and "products"."sku" = btrim("products"."sku")
        and "products"."sku" !~ '[[:cntrl:]]'
        and "products"."sku" !~ '  '),
	CONSTRAINT "products_name_canonical_check" CHECK ("products"."name" = btrim("products"."name") and char_length("products"."name") > 0),
	CONSTRAINT "products_category_code_check" CHECK ("products"."category_code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
	CONSTRAINT "products_unit_code_check" CHECK ("products"."unit_code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
	CONSTRAINT "products_status_check" CHECK ("products"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "products_timestamps_check" CHECK ("products"."updated_at" >= "products"."created_at")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"base_currency" varchar(3) NOT NULL,
	"timezone" varchar(64) DEFAULT 'Asia/Dubai' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_name_canonical_check" CHECK ("tenants"."name" = btrim("tenants"."name") and char_length("tenants"."name") > 0),
	CONSTRAINT "tenants_status_check" CHECK ("tenants"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "tenants_base_currency_check" CHECK ("tenants"."base_currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "tenants_timezone_canonical_check" CHECK ("tenants"."timezone" = btrim("tenants"."timezone") and char_length("tenants"."timezone") > 0),
	CONSTRAINT "tenants_timestamps_check" CHECK ("tenants"."updated_at" >= "tenants"."created_at")
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(160) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "warehouses_tenant_code_unique" UNIQUE("tenant_id","code"),
	CONSTRAINT "warehouses_tenant_id_unique" UNIQUE("tenant_id","id"),
	CONSTRAINT "warehouses_code_check" CHECK ("warehouses"."code" ~ '^[A-Z0-9][A-Z0-9._/-]*$'),
	CONSTRAINT "warehouses_name_canonical_check" CHECK ("warehouses"."name" = btrim("warehouses"."name") and char_length("warehouses"."name") > 0),
	CONSTRAINT "warehouses_status_check" CHECK ("warehouses"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "warehouses_timestamps_check" CHECK ("warehouses"."updated_at" >= "warehouses"."created_at")
);
--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "products_tenant_created_at_idx" ON "products" USING btree ("tenant_id","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "tenants_status_created_at_idx" ON "tenants" USING btree ("status","created_at" DESC NULLS LAST,"id");--> statement-breakpoint
CREATE INDEX "warehouses_tenant_name_idx" ON "warehouses" USING btree ("tenant_id","name","id");
