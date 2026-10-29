import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { TenantPermission } from "@/lib/tenancy/permissions";
import { getCompanyAccess } from "./context.service";
import { authorizeTenant, TenancyError } from "./security";

export async function requireTenantPage(
  locale: string,
  permission: TenantPermission,
) {
  const requestHeaders = await headers();
  try {
    return await authorizeTenant(requestHeaders, permission);
  } catch (error) {
    if (!(error instanceof TenancyError)) throw error;
    if (error.code === "UNAUTHENTICATED") redirect(`/${locale}/sign-in`);
    const access = await getCompanyAccess(requestHeaders);
    redirect(
      `/${locale}/${access.companies.length === 0 ? "onboarding" : "select-company"}`,
    );
  }
}
