import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { Link } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { isRegistrationEnabled } from "@/server/auth/environment";
import { getServerSession } from "@/server/auth/session";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign-up">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("signUp.metadataTitle") };
}

export default async function SignUpPage({
  params,
}: PageProps<"/[locale]/sign-up">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [session, t] = await Promise.all([
    getServerSession(),
    getTranslations({ locale, namespace: "Auth" }),
  ]);
  if (session) redirect(`/${locale}/pending-setup`);

  return (
    <AuthShell title={t("signUp.title")} description={t("signUp.description")}>
      {isRegistrationEnabled() ? (
        <AuthForm mode="sign-up" />
      ) : (
        <div className="space-y-5">
          <p className="rounded-md border bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
            {t("registrationUnavailable")}
          </p>
          <Link
            href="/sign-in"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-input bg-card px-4 py-2 text-sm font-medium"
          >
            {t("links.signIn")}
          </Link>
        </div>
      )}
    </AuthShell>
  );
}
