"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { onboardingInputSchema } from "@/lib/tenancy/validation";
import type { TenancyErrorCode } from "@/lib/tenancy/validation";
import { createCompanyAction } from "../actions";

const inputStyle =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function CompanyForm() {
  const t = useTranslations("Tenancy");
  const router = useRouter();
  const [operationId, setOperationId] = useState<string>();
  const [error, setError] = useState<TenancyErrorCode>();
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let key = operationId;
    try {
      key ??=
        sessionStorage.getItem("makhzan-onboarding-operation") ?? undefined;
    } catch {
      /* Storage may be disabled. */
    }
    key ??= crypto.randomUUID();
    try {
      sessionStorage.setItem("makhzan-onboarding-operation", key);
    } catch {
      /* In-memory retry still keeps the key. */
    }
    setOperationId(key);
    const input = {
      name: form.get("name"),
      baseCurrency: form.get("baseCurrency"),
      timezone: form.get("timezone"),
      operationId: key,
    };
    if (!onboardingInputSchema.safeParse(input).success) {
      setError("INVALID_INPUT");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const result = await createCompanyAction(input);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      try {
        sessionStorage.removeItem("makhzan-onboarding-operation");
      } catch {
        /* Optional persistence. */
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
    <form onSubmit={submit} className="space-y-5">
      <div className="space-y-2">
        <label htmlFor="company-name" className="text-sm font-medium">
          {t("fields.name")}
        </label>
        <input
          id="company-name"
          name="name"
          className={inputStyle}
          maxLength={160}
          autoComplete="organization"
          required
          disabled={pending}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="company-currency" className="text-sm font-medium">
          {t("fields.currency")}
        </label>
        <input
          id="company-currency"
          name="baseCurrency"
          defaultValue="AED"
          className={`${inputStyle} text-ltr`}
          maxLength={3}
          required
          disabled={pending}
          aria-describedby="currency-help"
        />
        <p id="currency-help" className="text-xs text-muted-foreground">
          {t("currencyHelp")}
        </p>
      </div>
      <div className="space-y-2">
        <label htmlFor="company-timezone" className="text-sm font-medium">
          {t("fields.timezone")}
        </label>
        <input
          id="company-timezone"
          name="timezone"
          defaultValue="Asia/Dubai"
          className={`${inputStyle} text-ltr`}
          maxLength={64}
          required
          disabled={pending}
          aria-describedby="timezone-help"
        />
        <p id="timezone-help" className="text-xs text-muted-foreground">
          {t("timezoneHelp")}
        </p>
      </div>
      <div role="status" aria-live="polite">
        {error ? (
          <p className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive">
            {t(`errors.${error}`)}
          </p>
        ) : null}
      </div>
      {error === "IDEMPOTENCY_CONFLICT" ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            try {
              sessionStorage.removeItem("makhzan-onboarding-operation");
            } catch {
              /* Optional persistence. */
            }
            setOperationId(undefined);
            setError(undefined);
          }}
        >
          {t("newAttempt")}
        </Button>
      ) : null}
      <Button className="w-full" type="submit" disabled={pending}>
        {t(pending ? "saving" : "create")}
      </Button>
    </form>
  );
}
