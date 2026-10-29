"use client";

import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import type { TenantRole } from "@/lib/tenancy/permissions";

export function MobileNavigation({ role }: { role: TenantRole }) {
  const t = useTranslations("Navigation");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 64rem)");
    const closeOnDesktop = () => {
      if (desktop.matches) setOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("open")}>
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent closeLabel={t("close")}>
        <SheetTitle className="sr-only">{t("mobileTitle")}</SheetTitle>
        <SheetDescription className="sr-only">{t("mobileDescription")}</SheetDescription>
        <div className="mt-12 mb-8"><Brand onNavigate={() => setOpen(false)} /></div>
        <Navigation role={role} onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
