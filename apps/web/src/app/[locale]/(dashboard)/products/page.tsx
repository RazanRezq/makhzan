import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ProductsTable } from "@/features/products/components/products-table";
import { routing } from "@/i18n/routing";
import { listProducts } from "@/server/products/product.service";

export async function generateMetadata({
  params,
}: PageProps<"/[locale]/products">): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const t = await getTranslations({ locale, namespace: "Products" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function ProductsPage({
  params,
}: PageProps<"/[locale]/products">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const [products, t] = await Promise.all([
    listProducts(),
    getTranslations({ locale, namespace: "Products" }),
  ]);

  return (
    <div className="min-w-0 space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-2 text-xs font-semibold tracking-wider text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            {t("title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            {t("description")}
          </p>
        </div>
        <span className="w-fit rounded-full border bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground">
          {t("demoLabel")}
        </span>
      </div>

      <ProductsTable products={products} locale={locale} />
    </div>
  );
}
