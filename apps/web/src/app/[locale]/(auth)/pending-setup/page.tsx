import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { getServerSession } from "@/server/auth/session";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/pending-setup">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("pending.metadataTitle") };
}

export default async function PendingSetupPage({
  params,
}: PageProps<"/[locale]/pending-setup">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [session, t] = await Promise.all([
    getServerSession(),
    getTranslations({ locale, namespace: "Auth" }),
  ]);
  if (!session) redirect(`/${locale}/sign-in`);

  return (
    <AuthShell title={t("pending.title")} description={t("pending.description")}>
      <div className="space-y-5">
        <p className="text-ltr rounded-md bg-muted px-4 py-3 text-sm text-muted-foreground">
          {session.user.email}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {t("pending.accessPolicy")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button asChild>
            <Link href="/">{t("pending.viewDemo")}</Link>
          </Button>
          <LogoutButton />
        </div>
      </div>
    </AuthShell>
  );
}
