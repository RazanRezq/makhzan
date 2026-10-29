import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";
import { getServerSession } from "@/server/auth/session";
import { requireTenantPage } from "@/server/tenants/page-access";
import { getCompanyAccess } from "@/server/tenants/context.service";

export const instant = false;

export default async function DashboardLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  const [session, t] = await Promise.all([
    getServerSession(),
    getTranslations("Shell"),
  ]);
  if (!session) redirect(`/${locale}/sign-in`);
  const tenant = await requireTenantPage(locale, "dashboard.read");
  const access = await getCompanyAccess(await headers());
  if (access.activeTenantId !== tenant.tenantId || access.contextVersion !== tenant.version)
    redirect(`/${locale}/select-company`);

  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed start-4 top-4 z-[60] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
      >
        {t("skip")}
      </a>
      <Sidebar role={tenant.role} />
      <div className="flex min-h-dvh min-w-0 flex-col lg:ps-64">
        <Header
          userName={session.user.name}
          companyName={tenant.name}
          role={tenant.role}
          companies={access.companies}
          activeTenantId={tenant.tenantId}
          contextVersion={tenant.version}
        />
        <main id="main-content" tabIndex={-1} className="mx-auto min-w-0 w-full max-w-7xl flex-1 px-4 py-8 sm:px-8 lg:py-10">
          {children}
        </main>
        <footer className="px-4 py-6 text-center text-xs text-muted-foreground sm:px-8">
          {t("footer")}
        </footer>
      </div>
    </div>
  );
}
