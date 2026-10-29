"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function TenantError({
  retry,
}: {
  error: unknown;
  retry: () => void;
}) {
  const t = useTranslations("Tenancy");
  return (
    <div
      className="mx-auto my-12 max-w-md space-y-4 rounded-xl border bg-card p-6"
      role="alert"
    >
      <p>{t("errors.UNAVAILABLE")}</p>
      <Button onClick={retry}>{t("refresh")}</Button>
    </div>
  );
}
