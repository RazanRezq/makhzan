"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { navigationItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import { hasPermission } from "@/lib/tenancy/permissions";
import type { TenantPermission, TenantRole } from "@/lib/tenancy/permissions";

const navigationPermissions: Partial<Record<(typeof navigationItems)[number]["key"], TenantPermission>> = {
  overview: "dashboard.read", products: "demoProducts.read", inventory: "inventory.read",
  purchases: "purchaseOrders.read", sales: "salesOrders.read", warehouses: "warehouses.read",
  reports: "reports.read", settings: "tenantSettings.read",
};

export function Navigation({ onNavigate, role }: { onNavigate?: () => void; role: TenantRole }) {
  const t = useTranslations("Navigation");
  const pathname = usePathname();

  return (
    <nav aria-label={t("label")} className="space-y-7">
      {(["workspace", "manage"] as const).map((group) => (
        <div key={group}>
          <p className="mb-3 px-3 text-xs font-medium tracking-wide text-muted-foreground">
            {t(group)}
          </p>
          <ul className="space-y-1">
            {navigationItems.filter((item) => item.group === group && (!navigationPermissions[item.key] || hasPermission(role, navigationPermissions[item.key]!))).map((item) => {
              const Icon = item.icon;
              const active = item.href !== null && pathname === item.href;
              const className = cn(
                "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm",
                active
                  ? "bg-accent font-semibold text-accent-foreground"
                  : "text-muted-foreground",
              );
              return (
                <li key={item.key}>
                  {item.href !== null ? (
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      onClick={onNavigate}
                      className={cn(className, "hover:bg-accent hover:text-accent-foreground")}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      {t(item.key)}
                      {active && <span className="ms-auto size-1.5 rounded-full bg-primary" aria-hidden="true" />}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      disabled
                      aria-label={t("unavailable", { section: t(item.key) })}
                      className={cn(className, "cursor-not-allowed")}
                    >
                      <Icon className="size-[18px] shrink-0" aria-hidden="true" />
                      {t(item.key)}
                      <span className="ms-auto rounded border px-1.5 py-0.5 text-[10px]">{t("soon")}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
