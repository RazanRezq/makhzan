import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { CompanySelector } from "@/features/tenancy/components/company-selector";
import { AutoCompanySelection } from "@/features/tenancy/components/auto-company-selection";
import { LanguageSwitcher } from "@/components/dashboard/language-switcher";
import { routing } from "@/i18n/routing";
import { requireServerSession } from "@/server/auth/session";
import { getCompanyAccess } from "@/server/tenants/context.service";

export const instant = false;

export default async function SelectCompanyPage({
  params,
}: PageProps<"/[locale]/select-company">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  await requireServerSession(locale);
  const access = await getCompanyAccess(await headers());
  if (access.companies.length === 0) redirect(`/${locale}/onboarding`);
  if (access.activeTenantId) redirect(`/${locale}`);
  if (access.needsAutoSelection) return <AutoCompanySelection />;
  const t = await getTranslations("Tenancy");
  return (
    <AuthShell
      title={t("selectionTitle")}
      description={t("selectionDescription")}
    >
      {access.selectionUnavailable ? (
        <p role="status" className="mb-4 rounded-md border p-3 text-sm text-muted-foreground">
          {t("selectionUnavailable")}
        </p>
      ) : null}
      <CompanySelector {...access} />
      <div className="mt-6 flex items-center justify-between gap-3">
        <LanguageSwitcher />
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
