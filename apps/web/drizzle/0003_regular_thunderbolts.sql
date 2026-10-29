CREATE TABLE "onboarding_requests" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"tenant_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_requests_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "onboarding_requests_fingerprint_check" CHECK ("onboarding_requests"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "session_tenant_context" (
	"session_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_tenant_context_version_check" CHECK ("session_tenant_context"."version" > 0),
	CONSTRAINT "session_tenant_context_timestamps_check" CHECK ("session_tenant_context"."updated_at" >= "session_tenant_context"."created_at")
);
--> statement-breakpoint
CREATE TABLE "tenant_creation_rate_limits" (
	"user_id" text NOT NULL,
	"operation_id" uuid NOT NULL,
	"fingerprint" varchar(64) NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_creation_rate_limits_user_id_operation_id_pk" PRIMARY KEY("user_id","operation_id"),
	CONSTRAINT "tenant_creation_rate_limits_fingerprint_check" CHECK ("tenant_creation_rate_limits"."fingerprint" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_memberships_tenant_id_user_id_pk" PRIMARY KEY("tenant_id","user_id"),
	CONSTRAINT "tenant_memberships_role_check" CHECK ("tenant_memberships"."role" in ('OWNER', 'MANAGER', 'STAFF', 'VIEWER')),
	CONSTRAINT "tenant_memberships_status_check" CHECK ("tenant_memberships"."status" in ('ACTIVE', 'INACTIVE')),
	CONSTRAINT "tenant_memberships_timestamps_check" CHECK ("tenant_memberships"."updated_at" >= "tenant_memberships"."created_at")
);
--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "onboarding_requests" ADD CONSTRAINT "onboarding_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "session_tenant_context" ADD CONSTRAINT "session_tenant_context_session_id_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."session"("id") ON DELETE cascade ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "session_tenant_context" ADD CONSTRAINT "session_tenant_context_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "tenant_creation_rate_limits" ADD CONSTRAINT "tenant_creation_rate_limits_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE restrict;--> statement-breakpoint
CREATE INDEX "onboarding_requests_tenant_idx" ON "onboarding_requests" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "session_tenant_context_tenant_idx" ON "session_tenant_context" USING btree ("tenant_id","session_id");--> statement-breakpoint
CREATE INDEX "tenant_creation_rate_limits_user_created_idx" ON "tenant_creation_rate_limits" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "tenant_memberships_tenant_role_idx" ON "tenant_memberships" USING btree ("tenant_id","status","role");--> statement-breakpoint
CREATE INDEX "tenant_memberships_user_status_idx" ON "tenant_memberships" USING btree ("user_id","status","tenant_id");