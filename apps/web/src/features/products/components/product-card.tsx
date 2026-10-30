"use client";

import type { ReactNode } from "react";
import { CalendarDays, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProductListItem } from "@/lib/products/catalog.types";
import { cn } from "@/lib/utils";
import { SelectionCheckbox } from "./selection-checkbox";

export function ProductCard({
  product,
  locale,
  timezone,
  selected,
  onSelectedChange,
  actions,
}: {
  product: ProductListItem;
  locale: string;
  timezone: string;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
  actions: ReactNode;
}) {
  const t = useTranslations("Products");
  const dates = new Intl.DateTimeFormat(locale === "ar" ? "ar-AE" : "en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    numberingSystem: "latn",
    timeZone: timezone,
  });
  return (
    <article
      className={cn(
        "min-w-0 overflow-hidden rounded-xl border bg-card p-4",
        selected && "border-primary/60 bg-accent/40",
      )}
    >
      <div className="flex items-start gap-3">
        <SelectionCheckbox
          checked={selected}
          label={t("selection.selectProduct", { name: product.name })}
          onCheckedChange={onSelectedChange}
          className="-ms-2 -mt-2 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words font-medium leading-6">
                {product.name}
              </h3>
              <p className="text-ltr mt-1 break-all font-mono text-xs text-muted-foreground">
                {product.sku}
              </p>
            </div>
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
                product.status === "ACTIVE"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {t(
                product.status === "ACTIVE"
                  ? "statuses.active"
                  : "statuses.inactive",
              )}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Tag
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <dt className="sr-only">{t("columns.category")}</dt>
              <dd className="text-ltr break-all text-muted-foreground">
                {product.categoryCode}
                <span aria-hidden="true"> · </span>
                {product.unitCode}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <dt className="sr-only">{t("columns.createdAt")}</dt>
              <dd className="text-muted-foreground">
                {dates.format(new Date(product.createdAt))}
              </dd>
            </div>
          </dl>
          {actions}
        </div>
      </div>
    </article>
  );
}
