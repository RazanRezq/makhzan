import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { hasLocale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ProductsTable } from "@/features/products/components/products-table";
import { routing } from "@/i18n/routing";
import { requireTenantPage } from "@/server/tenants/page-access";
import { listProducts, ProductError } from "@/server/products/product.service";
import { Link } from "@/i18n/navigation";
import type { ProductListResult } from "@/lib/products/catalog.types";
import { TenancyError } from "@/server/tenants/security";

export const instant = false;

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
  searchParams,
}: PageProps<"/[locale]/products">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  const tenant = await requireTenantPage(locale, "products.read");
  const t = await getTranslations({ locale, namespace: "Products" });
  let listing: ProductListResult;
  try {
    listing = await listProducts(
      await headers(),
      await searchParams,
      tenant.version,
    );
  } catch (error) {
    if (error instanceof TenancyError && error.code === "STALE_CONTEXT") {
      return (
        <div role="alert" className="space-y-4 rounded-lg border p-6">
          <p>{t("errors.STALE_CONTEXT")}</p>
          <a
            href={`/${locale}/products`}
            className="inline-flex min-h-11 items-center underline"
          >
            {t("actions.refreshWorkspace")}
          </a>
        </div>
      );
    }
    if (!(error instanceof ProductError) || error.code !== "INVALID_INPUT")
      throw error;
    return (
      <div role="alert" className="space-y-4 rounded-lg border p-6">
        <p>{t("errors.INVALID_INPUT")}</p>
        <Link
          href="/products"
          className="inline-flex min-h-11 items-center underline"
        >
          {t("clearFilters")}
        </Link>
      </div>
    );
  }

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
      </div>

      <ProductsTable
        key={`${tenant.tenantId}:${listing.contextVersion}`}
        listing={listing}
        locale={locale}
      />
    </div>
  );
}
