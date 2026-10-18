"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNavigation } from "./mobile-navigation";

export function Header() {
  const t = useTranslations("Shell");
  const pathname = usePathname();
  const currentSection = pathname.startsWith("/products")
    ? t("products")
    : t("overview");
  return (
    <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <span className="hidden text-muted-foreground sm:inline">{t("workspace")}</span>
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block rtl:rotate-180" aria-hidden="true" />
          <span className="truncate font-medium">{currentSection}</span>
        </div>
      </div>
      <LanguageSwitcher />
    </header>
  );
}
