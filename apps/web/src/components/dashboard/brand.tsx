import { Boxes } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Brand({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("Brand");
  return (
    <Link
      href="/"
      aria-label={t("home")}
      onClick={onNavigate}
      className="inline-flex min-h-11 w-fit items-center gap-3 rounded-lg"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
        <Boxes className="size-6" aria-hidden="true" />
      </span>
      <span>
        <span className="block text-xl font-semibold tracking-tight">{t("name")}</span>
        <span className="block text-xs text-muted-foreground">{t("tagline")}</span>
      </span>
    </Link>
  );
}
