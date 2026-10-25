"use client";

import { useState } from "react";
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogout() {
    setIsSubmitting(true);
    try {
      await authClient.signOut();
      router.replace("/sign-in");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={handleLogout}
      disabled={isSubmitting}
    >
      <LogOut aria-hidden="true" />
      <span className={compactOnMobile ? "sr-only sm:not-sr-only" : undefined}>
        {isSubmitting ? t("actions.signingOut") : t("actions.signOut")}
      </span>
    </Button>
  );
}
