"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import type { TenantRole } from "@/lib/tenancy/permissions";
import type { TenancyErrorCode } from "@/lib/tenancy/validation";
import { selectCompanyAction } from "../actions";

export function CompanySelector({
  companies,
  contextVersion,
  activeTenantId,
}: {
  companies: { tenantId: string; name: string; role: TenantRole }[];
  contextVersion: number;
  activeTenantId: string | null;
}) {
  const t = useTranslations("Tenancy");
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<TenancyErrorCode>();

  async function choose(tenantId: string) {
    setPending(true);
    setError(undefined);
    try {
      const result = await selectCompanyAction({
        tenantId,
        expectedVersion: contextVersion,
      });
      if (!result.ok) {
        setError(result.code);
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("UNAVAILABLE");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      {companies.length === 0 ? (
        <p className="rounded-md border bg-muted p-4 text-sm text-muted-foreground">
          {t("noAccess")}
        </p>
      ) : null}
      <ul className="space-y-3">
        {companies.map((company) => (
          <li key={company.tenantId}>
            <Button
              variant="outline"
              aria-label={t("companyOption", {
                name: company.name,
                role: t(`roles.${company.role}`),
              })}
              aria-current={
                company.tenantId === activeTenantId ? "true" : undefined
              }
              className="h-auto min-h-14 w-full justify-between gap-4 py-3 text-start"
              disabled={pending}
              onClick={() => choose(company.tenantId)}
            >
              <span className="min-w-0 truncate">{company.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {t(`roles.${company.role}`)}
                {company.tenantId === activeTenantId ? (
                  <span className="ms-2">{t("current")}</span>
                ) : null}
              </span>
            </Button>
          </li>
        ))}
      </ul>
      <div role="status" aria-live="polite">
        {error ? (
          <p className="text-sm text-destructive">{t(`errors.${error}`)}</p>
        ) : null}
      </div>
      {error ? (
        <Button variant="outline" onClick={() => router.refresh()}>
          {t("refresh")}
        </Button>
      ) : null}
    </div>
  );
}
