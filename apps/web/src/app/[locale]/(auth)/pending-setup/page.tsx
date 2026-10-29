import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireServerSession } from "@/server/auth/session";
import { getCompanyAccess } from "@/server/tenants/context.service";

export const instant = false;

export default async function PendingSetupPage({ params }: PageProps<"/[locale]/pending-setup">) {
  const { locale } = await params;
  await requireServerSession(locale);
  const access = await getCompanyAccess(await headers());
  redirect(`/${locale}/${access.activeTenantId ? "" : access.companies.length === 0 ? "onboarding" : "select-company"}`);
}
