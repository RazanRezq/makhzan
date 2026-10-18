"use client";

import { Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageSwitcher() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Shell");
  const targetLocale = locale === "en" ? "ar" : "en";

  return (
    <Button asChild variant="outline">
      <Link
        href={pathname}
        locale={targetLocale}
        lang={targetLocale}
        aria-label={t("switchLanguageLabel")}
      >
        <Languages aria-hidden="true" />
        <span>{t("switchLanguage")}</span>
      </Link>
    </Button>
  );
}
