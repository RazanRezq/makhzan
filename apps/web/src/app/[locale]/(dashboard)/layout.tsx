import { getTranslations } from "next-intl/server";
import { Header } from "@/components/dashboard/header";
import { Sidebar } from "@/components/dashboard/sidebar";

export default async function DashboardLayout({
  children,
}: LayoutProps<"/[locale]">) {
  const t = await getTranslations("Shell");
  return (
    <div className="min-h-dvh">
      <a
        href="#main-content"
        className="sr-only fixed start-4 top-4 z-[60] rounded-md bg-primary px-4 py-3 text-primary-foreground focus:not-sr-only"
      >
        {t("skip")}
      </a>
      <Sidebar />
      <div className="flex min-h-dvh min-w-0 flex-col lg:ps-64">
        <Header />
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
