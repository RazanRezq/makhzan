"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { usePathname } from "@/i18n/navigation";
import { CompanySwitcher } from "@/features/tenancy/components/company-switcher";
import type { CompanySwitcherProps } from "@/features/tenancy/components/company-switcher";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNavigation } from "./mobile-navigation";

export function Header({ userName, ...companyProps }: CompanySwitcherProps & { userName: string }) {
  const t = useTranslations("Shell");
  const pathname = usePathname();
  const currentSection = pathname.startsWith("/products")
    ? t("products")
    : t("overview");
  return (
    <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation role={companyProps.role} />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <CompanySwitcher {...companyProps} />
          <ChevronRight className="hidden size-4 text-muted-foreground sm:block rtl:rotate-180" aria-hidden="true" />
          <span className="hidden truncate font-medium sm:inline">{currentSection}</span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:block">
          {userName}
        </span>
        <LanguageSwitcher />
        <LogoutButton compactOnMobile />
      </div>
    </header>
  );
}
