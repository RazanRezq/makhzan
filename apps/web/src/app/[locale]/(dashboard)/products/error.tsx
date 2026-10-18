"use client";

import { CircleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function ProductsError({ retry }: { error: unknown; retry: () => void }) {
  const t = useTranslations("Products");

  return (
    <div className="flex min-h-96 flex-col items-center justify-center rounded-xl border bg-card px-6 py-12 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-muted">
        <CircleAlert className="size-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <h1 className="text-xl font-semibold">{t("error.title")}</h1>
      <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
        {t("error.description")}
      </p>
      <Button type="button" className="mt-6" onClick={() => retry()}>
        {t("error.retry")}
      </Button>
    </div>
  );
}
