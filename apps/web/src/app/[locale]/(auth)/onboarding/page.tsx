import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { CompanyForm } from "@/features/tenancy/components/company-form";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { routing } from "@/i18n/routing";
import { requireServerSession } from "@/server/auth/session";
import { getCompanyAccess } from "@/server/tenants/context.service";

export const instant = false;

export default async function OnboardingPage({
  params,
}: PageProps<"/[locale]/onboarding">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireServerSession(locale);
  const access = await getCompanyAccess(await headers());
  if (!access.canOnboard)
    redirect(`/${locale}/${access.activeTenantId ? "" : "select-company"}`);
  const t = await getTranslations("Tenancy");
  return (
    <AuthShell
      title={t("onboardingTitle")}
      description={t("onboardingDescription")}
    >
      <CompanyForm />
      <div className="mt-6 flex items-center justify-between gap-3">
        <LanguageSwitcher />
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
