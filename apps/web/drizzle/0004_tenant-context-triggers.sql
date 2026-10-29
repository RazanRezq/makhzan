CREATE TRIGGER "tenant_memberships_set_updated_at"
BEFORE UPDATE ON "tenant_memberships"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "session_tenant_context_set_updated_at"
BEFORE UPDATE ON "session_tenant_context"
FOR EACH ROW EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE FUNCTION "increment_tenant_context_version"()
RETURNS trigger LANGUAGE plpgsql AS $function$
BEGIN
  NEW.version := OLD.version + 1;
  RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER "session_tenant_context_increment_version"
BEFORE UPDATE ON "session_tenant_context"
FOR EACH ROW EXECUTE FUNCTION "increment_tenant_context_version"();
