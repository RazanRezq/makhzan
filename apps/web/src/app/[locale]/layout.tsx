import type { Metadata } from "next";
import { Geist, Noto_Sans_Arabic } from "next/font/google";
import { notFound } from "next/navigation";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations } from "next-intl/server";
import { DirectionProvider } from "@/components/ui/direction";
import { routing } from "@/i18n/routing";
import { cn } from "@/lib/utils";
import "../globals.css";

const geist = Geist({ variable: "--font-latin", subsets: ["latin"] });
const arabic = Noto_Sans_Arabic({
  variable: "--font-arabic",
  subsets: ["arabic"],
});

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: LayoutProps<"/[locale]">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Metadata" });
  return { title: t("title"), description: t("description") };
}

export default async function LocaleLayout({
  children,
  params,
}: LayoutProps<"/[locale]">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const direction = locale === "ar" ? "rtl" : "ltr";

  return (
    <html
      lang={locale}
      dir={direction}
      className={cn(geist.variable, arabic.variable, "h-full antialiased")}
    >
      <body className="min-h-full bg-background font-sans text-foreground">
        <NextIntlClientProvider>
          <DirectionProvider dir={direction}>{children}</DirectionProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
