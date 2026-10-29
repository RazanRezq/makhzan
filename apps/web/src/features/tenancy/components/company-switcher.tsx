"use client";

import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import type { TenantRole } from "@/lib/tenancy/permissions";
import { CompanySelector } from "./company-selector";

export type CompanySwitcherProps = {
  companies: { tenantId: string; name: string; role: TenantRole }[];
  activeTenantId: string;
  companyName: string;
  role: TenantRole;
  contextVersion: number;
};

export function CompanySwitcher(props: CompanySwitcherProps) {
  const { companies, companyName, role } = props;
  const t = useTranslations("Tenancy");
  const [open, setOpen] = useState(false);
  const label = (
    <span className="flex min-w-0 flex-col text-start">
      <span className="max-w-24 truncate sm:max-w-48">{companyName}</span>
      <span className="text-xs text-muted-foreground">{t(`roles.${role}`)}</span>
    </span>
  );
  if (companies.length <= 1) {
    return <div className="flex min-h-11 min-w-0 items-center" aria-label={t("activeCompany")}>{label}</div>;
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          className="h-auto min-h-11 min-w-0 gap-2 px-2 py-1"
          aria-label={t("switchCompanyLabel", { name: companyName, role: t(`roles.${role}`) })}
        >
          {label}
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("closeSwitcher")} className="w-80">
        <SheetTitle className="mt-12 text-lg font-semibold">{t("selectionTitle")}</SheetTitle>
        <SheetDescription className="mt-2 mb-6 text-sm text-muted-foreground">
          {t("selectionDescription")}
        </SheetDescription>
        <CompanySelector {...props} onSelected={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
