import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { TenantPermission } from "@/lib/tenancy/permissions";
import { hasPermission } from "@/lib/tenancy/permissions";
import { getCompanyAccess } from "./context.service";
import { authorizeTenant, TenancyError } from "./security";

// React cache is request-scoped, never a cross-user/shared authorization cache.
// Layout and page use one render-intent version; services still authorize fresh
// under transaction locks and reject a version changed during this render.
const tenantRenderContext = cache(async (locale: string) => {
  const requestHeaders = await headers();
  try {
    return await authorizeTenant(requestHeaders, "dashboard.read");
  } catch (error) {
    if (!(error instanceof TenancyError)) throw error;
    if (error.code === "UNAUTHENTICATED") redirect(`/${locale}/sign-in`);
    const access = await getCompanyAccess(requestHeaders);
    redirect(
      `/${locale}/${access.companies.length === 0 ? "onboarding" : "select-company"}`,
    );
  }
});

export async function requireTenantPage(
  locale: string,
  permission: TenantPermission,
) {
  const context = await tenantRenderContext(locale);
  if (!hasPermission(context.role, permission))
    redirect(`/${locale}/select-company`);
  return context;
}
