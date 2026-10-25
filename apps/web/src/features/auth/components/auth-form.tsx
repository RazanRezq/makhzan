"use client";

import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/auth-client";
import {
  AUTH_NAME_MAX_LENGTH,
  AUTH_NAME_MIN_LENGTH,
  AUTH_PASSWORD_MAX_LENGTH,
  AUTH_PASSWORD_MIN_LENGTH,
  signInInputSchema,
  signUpInputSchema,
} from "@/lib/auth/validation";

type AuthMode = "sign-in" | "sign-up";
type FieldName = "confirmPassword" | "email" | "name" | "password";
type FieldErrors = Partial<Record<FieldName, string>>;

function inputClassName(hasError: boolean) {
  return `min-h-11 w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
    hasError ? "border-red-600" : "border-input"
  }`;
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isSubmitting, setIsSubmitting] = useState(false);

  function validationMessage(field: FieldName) {
    if (field === "email") return t("validation.email");
    if (field === "name") {
      return t("validation.name", {
        min: AUTH_NAME_MIN_LENGTH,
        max: AUTH_NAME_MAX_LENGTH,
      });
    }
    if (field === "confirmPassword") return t("validation.passwordMatch");
    return mode === "sign-up"
      ? t("validation.password", {
          min: AUTH_PASSWORD_MIN_LENGTH,
          max: AUTH_PASSWORD_MAX_LENGTH,
        })
      : t("validation.passwordRequired");
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    setFormError(undefined);

    const form = new FormData(event.currentTarget);
    const input = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      confirmPassword: String(form.get("confirmPassword") ?? ""),
    };
    const result =
      mode === "sign-up"
        ? signUpInputSchema.safeParse(input)
        : signInInputSchema.safeParse(input);

    if (!result.success) {
      const errors: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          typeof field === "string" &&
          ["confirmPassword", "email", "name", "password"].includes(field) &&
          !errors[field as FieldName]
        ) {
          errors[field as FieldName] = validationMessage(field as FieldName);
        }
      }
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (mode === "sign-up") {
        const registrationInput = signUpInputSchema.parse(input);
        const registration = await authClient.signUp.email({
          name: registrationInput.name,
          email: registrationInput.email,
          password: registrationInput.password,
        });
        if (registration.error) {
          setFormError(
            registration.error.status === 429
              ? t("errors.rateLimited")
              : t("errors.registration"),
          );
          return;
        }

        const signIn = await authClient.signIn.email({
          email: registrationInput.email,
          password: registrationInput.password,
        });
        if (signIn.error) {
          setFormError(t("errors.registration"));
          return;
        }
        router.replace("/pending-setup");
      } else {
        const credentials = signInInputSchema.parse(input);
        const signIn = await authClient.signIn.email({
          email: credentials.email,
          password: credentials.password,
        });
        if (signIn.error) {
          setFormError(
            signIn.error.status === 429
              ? t("errors.rateLimited")
              : t("errors.credentials"),
          );
          return;
        }
        router.replace("/");
      }
      router.refresh();
    } catch {
      setFormError(t("errors.unavailable"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      {mode === "sign-up" ? (
        <div className="space-y-2">
          <label htmlFor="name" className="text-sm font-medium">
            {t("fields.name")}
          </label>
          <input
            id="name"
            name="name"
            autoComplete="name"
            className={inputClassName(Boolean(fieldErrors.name))}
            aria-invalid={Boolean(fieldErrors.name)}
            aria-describedby={fieldErrors.name ? "name-error" : undefined}
            disabled={isSubmitting}
            required
          />
          {fieldErrors.name ? (
            <p id="name-error" className="text-sm text-red-700 dark:text-red-300">
              {fieldErrors.name}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-2">
        <label htmlFor="email" className="text-sm font-medium">
          {t("fields.email")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          className={`${inputClassName(Boolean(fieldErrors.email))} text-ltr`}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          disabled={isSubmitting}
          required
        />
        {fieldErrors.email ? (
          <p id="email-error" className="text-sm text-red-700 dark:text-red-300">
            {fieldErrors.email}
          </p>
        ) : null}
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium">
          {t("fields.password")}
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          className={`${inputClassName(Boolean(fieldErrors.password))} text-ltr`}
          aria-invalid={Boolean(fieldErrors.password)}
          aria-describedby={fieldErrors.password ? "password-error" : undefined}
          disabled={isSubmitting}
          required
        />
        {fieldErrors.password ? (
          <p id="password-error" className="text-sm text-red-700 dark:text-red-300">
            {fieldErrors.password}
          </p>
        ) : null}
      </div>

      {mode === "sign-up" ? (
        <div className="space-y-2">
          <label htmlFor="confirmPassword" className="text-sm font-medium">
            {t("fields.confirmPassword")}
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            className={`${inputClassName(Boolean(fieldErrors.confirmPassword))} text-ltr`}
            aria-invalid={Boolean(fieldErrors.confirmPassword)}
            aria-describedby={
              fieldErrors.confirmPassword ? "confirm-password-error" : undefined
            }
            disabled={isSubmitting}
            required
          />
          {fieldErrors.confirmPassword ? (
            <p
              id="confirm-password-error"
              className="text-sm text-red-700 dark:text-red-300"
            >
              {fieldErrors.confirmPassword}
            </p>
          ) : null}
        </div>
      ) : null}

      <div aria-live="polite" aria-atomic="true">
        {formError ? (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
            {formError}
          </p>
        ) : null}
      </div>

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
        ) : null}
        {isSubmitting
          ? t("actions.submitting")
          : t(mode === "sign-up" ? "actions.signUp" : "actions.signIn")}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        {t(mode === "sign-up" ? "links.haveAccount" : "links.needAccount")} {" "}
        <Link
          href={mode === "sign-up" ? "/sign-in" : "/sign-up"}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {t(mode === "sign-up" ? "links.signIn" : "links.signUp")}
        </Link>
      </p>
    </form>
  );
}
