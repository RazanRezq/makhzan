"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import type { TenantRole } from "@/lib/tenancy/permissions";
import { LogoutButton } from "@/features/auth/components/logout-button";
import { LanguageSwitcher } from "./language-switcher";
import { MobileNavigation } from "./mobile-navigation";

export function Header({ userName, companyName, role }: { userName: string; companyName: string; role: TenantRole }) {
  const t = useTranslations("Shell");
  const company = useTranslations("Tenancy");
  const pathname = usePathname();
  const currentSection = pathname.startsWith("/products")
    ? t("products")
    : t("overview");
  return (
    <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between gap-3 border-b bg-card px-4 sm:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNavigation role={role} />
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <Link href="/select-company" aria-label={company("switchCompany")} className="flex min-h-11 min-w-0 flex-col justify-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="max-w-28 truncate sm:max-w-48">{companyName}</span>
            <span className="text-xs text-muted-foreground">{company(`roles.${role}`)}</span>
          </Link>
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
