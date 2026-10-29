import { z } from "zod";
import { TENANT_ROLES } from "./permissions";

export const CREATION_ATTEMPT_LIMIT = 5;
export const CREATION_WINDOW_SECONDS = 600;

export const companyInputSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    baseCurrency: z
      .string()
      .trim()
      .toUpperCase()
      .refine((value) => Intl.supportedValuesOf("currency").includes(value)),
    timezone: z
      .string()
      .trim()
      .max(64)
      .refine(
        (value) =>
          value === "UTC" || Intl.supportedValuesOf("timeZone").includes(value),
      ),
  })
  .strict();

export const onboardingInputSchema = companyInputSchema.extend({
  operationId: z.uuid(),
});

export const contextVersionSchema = z.number().int().min(0).max(2_147_483_647);
export const selectionInputSchema = z
  .object({
    tenantId: z.uuid(),
    expectedVersion: contextVersionSchema,
  })
  .strict();

export const membershipInputSchema = z
  .object({
    targetUserId: z.string().min(1).max(256),
    role: z.enum(TENANT_ROLES),
    status: z.enum(["ACTIVE", "INACTIVE"]),
    expectedVersion: contextVersionSchema,
  })
  .strict();

export const TENANCY_ERROR_CODES = [
  "UNAUTHENTICATED",
  "INVALID_INPUT",
  "NO_TENANT",
  "FORBIDDEN",
  "STALE_CONTEXT",
  "ALREADY_MEMBER",
  "IDEMPOTENCY_CONFLICT",
  "RATE_LIMITED",
  "FINAL_OWNER",
  "UNAVAILABLE",
] as const;
export type TenancyErrorCode = (typeof TENANCY_ERROR_CODES)[number];
export type TenantActionResult =
  { ok: true } | { ok: false; code: TenancyErrorCode };
export type CompanyEntryResult =
  | { ok: true; destination: "/" | "/onboarding" | "/select-company" }
  | { ok: false; code: TenancyErrorCode };
