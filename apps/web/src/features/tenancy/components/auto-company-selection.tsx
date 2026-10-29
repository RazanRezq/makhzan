"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { TenancyErrorCode } from "@/lib/tenancy/validation";
import { resolveCompanyEntryAction } from "../actions";
import { TenantLoading } from "./tenant-loading";

export function AutoCompanySelection() {
  const t = useTranslations("Tenancy");
  const router = useRouter();
  const started = useRef(false);
  const [error, setError] = useState<TenancyErrorCode>();
  const enter = useCallback(async () => {
    setError(undefined);
    try {
      const result = await resolveCompanyEntryAction();
      if (!result.ok) {
        if (result.code === "UNAUTHENTICATED") {
          router.replace("/sign-in");
          return;
        }
        setError(result.code);
        return;
      }
      router.replace(result.destination);
      router.refresh();
    } catch {
      setError("UNAVAILABLE");
    }
  }, [router]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    startTransition(enter);
  }, [enter]);

  return (
    <main className="px-4 py-10">
      <div role="status" aria-live="polite" className="text-center text-sm text-muted-foreground">
        {error ? t(`errors.${error}`) : t("openingWorkspace")}
      </div>
      {error ? (
        <div className="mt-4 text-center">
          <Button onClick={() => startTransition(enter)}>{t("retry")}</Button>
        </div>
      ) : <TenantLoading />}
    </main>
  );
}
