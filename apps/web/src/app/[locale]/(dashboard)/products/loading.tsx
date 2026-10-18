import { getTranslations } from "next-intl/server";
import { Skeleton } from "@/components/ui/skeleton";

export default async function ProductsLoading() {
  const t = await getTranslations("Products");

  return (
    <div className="space-y-8" role="status" aria-label={t("loading.label")}>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-10 w-52" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <div className="rounded-xl border bg-card p-5">
        <div className="grid gap-4 lg:grid-cols-5">
          <Skeleton className="h-11 lg:col-span-2" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      </div>
      <div className="space-y-3 rounded-xl border bg-card p-5">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
      <span className="sr-only">{t("loading.description")}</span>
    </div>
  );
}
