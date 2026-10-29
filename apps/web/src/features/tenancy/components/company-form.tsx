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

type CompanyField = "name" | "baseCurrency" | "timezone";

export function CompanyForm({
  currencies,
  timezones,
}: {
  currencies: { code: string; label: string }[];
  timezones: string[];
}) {
  const t = useTranslations("Tenancy");
  const router = useRouter();
  const [operationId, setOperationId] = useState<string>();
  const [error, setError] = useState<TenancyErrorCode>();
  const [pending, setPending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<CompanyField, boolean>>
  >({});

  function clearFieldError(field: CompanyField) {
    setFieldErrors((current) => ({ ...current, [field]: false }));
    setError((current) => (current === "INVALID_INPUT" ? undefined : current));
  }

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
    const parsed = onboardingInputSchema.safeParse(input);
    if (!parsed.success) {
      const invalidFields: Partial<Record<CompanyField, boolean>> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field === "name" || field === "baseCurrency" || field === "timezone")
          invalidFields[field] = true;
      }
      setFieldErrors(invalidFields);
      setError("INVALID_INPUT");
      return;
    }
    setFieldErrors({});
    setPending(true);
    setError(undefined);
    try {
      const result = await createCompanyAction(parsed.data);
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
          aria-invalid={fieldErrors.name || undefined}
          aria-describedby={fieldErrors.name ? "company-name-error" : undefined}
          onChange={() => clearFieldError("name")}
        />
        {fieldErrors.name ? (
          <p id="company-name-error" className="text-sm text-destructive">
            {t("validation.name")}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <label htmlFor="company-currency" className="text-sm font-medium">
          {t("fields.currency")}
        </label>
        <select
          id="company-currency"
          name="baseCurrency"
          defaultValue="AED"
          className={`${inputStyle} text-ltr`}
          required
          disabled={pending}
          aria-invalid={fieldErrors.baseCurrency || undefined}
          aria-describedby={
            fieldErrors.baseCurrency ? "currency-help currency-error" : "currency-help"
          }
          onChange={() => clearFieldError("baseCurrency")}
        >
          {currencies.map(({ code, label }) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
        </select>
        <p id="currency-help" className="text-xs text-muted-foreground">
          {t("currencyHelp")}
        </p>
        {fieldErrors.baseCurrency ? (
          <p id="currency-error" className="text-sm text-destructive">
            {t("validation.currency")}
          </p>
        ) : null}
      </div>
      <div className="space-y-2">
        <label htmlFor="company-timezone" className="text-sm font-medium">
          {t("fields.timezone")}
        </label>
        <select
          id="company-timezone"
          name="timezone"
          defaultValue="Asia/Dubai"
          className={`${inputStyle} text-ltr`}
          required
          disabled={pending}
          aria-invalid={fieldErrors.timezone || undefined}
          aria-describedby={
            fieldErrors.timezone ? "timezone-help timezone-error" : "timezone-help"
          }
          onChange={() => clearFieldError("timezone")}
        >
          {timezones.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone}
            </option>
          ))}
        </select>
        <p id="timezone-help" className="text-xs text-muted-foreground">
          {t("timezoneHelp")}
        </p>
        {fieldErrors.timezone ? (
          <p id="timezone-error" className="text-sm text-destructive">
            {t("validation.timezone")}
          </p>
        ) : null}
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
