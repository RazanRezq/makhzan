"use client";

import { useId, useState } from "react";
import { LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth/auth-client";

export function LogoutButton({
  className,
  compactOnMobile = false,
}: {
  className?: string;
  compactOnMobile?: boolean;
}) {
  const t = useTranslations("Auth");
  const router = useRouter();
  const errorId = useId();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);
    setHasError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setHasError(true);
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setHasError(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="outline"
        className={className}
        onClick={handleLogout}
        disabled={isSubmitting}
        aria-describedby={hasError ? errorId : undefined}
      >
        <LogOut aria-hidden="true" />
        <span className={compactOnMobile ? "sr-only sm:not-sr-only" : undefined}>
          {isSubmitting ? t("actions.signingOut") : t("actions.signOut")}
        </span>
      </Button>
      {hasError ? (
        <p id={errorId} role="alert" className="max-w-xs text-sm text-foreground">
          {t("errors.signOut")}
        </p>
      ) : null}
    </div>
  );
}
