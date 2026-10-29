"use server";

import { headers } from "next/headers";
import { createFirstCompany } from "@/server/tenants/onboarding.service";
import { resolveCompanyEntry, selectCompany } from "@/server/tenants/context.service";
import { TenancyError } from "@/server/tenants/security";
import type { CompanyEntryResult, TenantActionResult } from "@/lib/tenancy/validation";

export async function resolveCompanyEntryAction(): Promise<CompanyEntryResult> {
  try {
    return { ok: true, ...await resolveCompanyEntry(await headers()) };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof TenancyError ? error.code : "UNAVAILABLE",
    };
  }
}

export async function createCompanyAction(
  input: unknown,
): Promise<TenantActionResult> {
  try {
    await createFirstCompany(await headers(), input);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof TenancyError ? error.code : "UNAVAILABLE",
    };
  }
}

export async function selectCompanyAction(
  input: unknown,
): Promise<TenantActionResult> {
  try {
    await selectCompany(await headers(), input);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      code: error instanceof TenancyError ? error.code : "UNAVAILABLE",
    };
  }
}
