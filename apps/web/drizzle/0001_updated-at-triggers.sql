CREATE FUNCTION "set_updated_at"()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
	NEW.created_at := OLD.created_at;
	NEW.updated_at := GREATEST(clock_timestamp(), OLD.updated_at);
	RETURN NEW;
END;
$function$;
--> statement-breakpoint
CREATE TRIGGER "tenants_set_updated_at"
BEFORE UPDATE ON "tenants"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "products_set_updated_at"
BEFORE UPDATE ON "products"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
--> statement-breakpoint
CREATE TRIGGER "warehouses_set_updated_at"
BEFORE UPDATE ON "warehouses"
FOR EACH ROW
EXECUTE FUNCTION "set_updated_at"();
