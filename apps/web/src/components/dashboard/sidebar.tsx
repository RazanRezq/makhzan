import { Sprout } from "lucide-react";
import { useTranslations } from "next-intl";
import { Brand } from "./brand";
import { Navigation } from "./navigation";
import type { TenantRole } from "@/lib/tenancy/permissions";

export function Sidebar({ role }: { role: TenantRole }) {
  const t = useTranslations("Shell");
  return (
    <aside className="fixed inset-y-0 start-0 z-30 hidden w-64 flex-col overflow-y-auto border-e bg-sidebar p-5 lg:flex">
      <div className="px-2 py-3"><Brand /></div>
      <div className="mt-9"><Navigation role={role} /></div>
      <div className="mt-auto pt-8">
        <div className="rounded-xl border bg-background p-4">
          <Sprout className="mb-3 size-5 text-primary" aria-hidden="true" />
          <p className="text-sm font-medium">{t("preview")}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{t("previewDescription")}</p>
        </div>
      </div>
    </aside>
  );
}
