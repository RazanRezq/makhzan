import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { CompanySelector } from "@/features/tenancy/components/company-selector";
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
  if (access.canOnboard) redirect(`/${locale}/onboarding`);
  const t = await getTranslations("Tenancy");
  return (
    <AuthShell
      title={t("selectionTitle")}
      description={t("selectionDescription")}
    >
      <CompanySelector {...access} />
      <div className="mt-6 flex items-center justify-between gap-3">
        <LanguageSwitcher />
        <LogoutButton />
      </div>
    </AuthShell>
  );
}
