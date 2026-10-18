"use client";

import { CalendarDays, Tag } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Product } from "@/lib/products/product.types";
import { cn } from "@/lib/utils";
import {
  categoryTranslationKeys,
  createProductDateFormatter,
  statusTranslationKeys,
  unitTranslationKeys,
} from "../product-labels";
import { SelectionCheckbox } from "./selection-checkbox";

type ProductCardProps = {
  product: Product;
  locale: string;
  selected: boolean;
  onSelectedChange: (selected: boolean) => void;
};

export function ProductCard({
  product,
  locale,
  selected,
  onSelectedChange,
}: ProductCardProps) {
  const t = useTranslations("Products");
  const dateFormatter = createProductDateFormatter(locale);

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
              <h3 className="font-medium leading-6">{product.name}</h3>
              <p className="text-ltr mt-1 font-mono text-xs text-muted-foreground">
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
              {t(statusTranslationKeys[product.status])}
            </span>
          </div>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex items-center gap-2">
              <Tag className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dt className="sr-only">{t("columns.category")}</dt>
              <dd className="text-muted-foreground">
                {t(categoryTranslationKeys[product.category])}
                <span aria-hidden="true"> · </span>
                {t(unitTranslationKeys[product.unit])}
              </dd>
            </div>
            <div className="flex items-center gap-2">
              <CalendarDays className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <dt className="sr-only">{t("columns.createdAt")}</dt>
              <dd className="text-muted-foreground">
                {dateFormatter.format(new Date(product.createdAt))}
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </article>
  );
}
