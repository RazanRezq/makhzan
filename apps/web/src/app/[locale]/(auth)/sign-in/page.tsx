import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AuthForm } from "@/features/auth/components/auth-form";
import { AuthShell } from "@/features/auth/components/auth-shell";
import { routing } from "@/i18n/routing";
import { getServerSession } from "@/server/auth/session";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/sign-in">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Auth" });
  return { title: t("signIn.metadataTitle") };
}

export default async function SignInPage({
  params,
}: PageProps<"/[locale]/sign-in">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [session, t] = await Promise.all([
    getServerSession(),
    getTranslations({ locale, namespace: "Auth" }),
  ]);
  if (session) redirect(`/${locale}`);

  return (
    <AuthShell title={t("signIn.title")} description={t("signIn.description")}>
      <AuthForm mode="sign-in" />
    </AuthShell>
  );
}
