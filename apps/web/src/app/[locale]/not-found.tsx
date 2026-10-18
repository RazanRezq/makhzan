import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <p className="text-sm font-semibold tracking-widest text-primary">{t("code")}</p>
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="max-w-md text-muted-foreground">{t("description")}</p>
      <Button asChild>
        <Link href="/">
          <ArrowLeft aria-hidden="true" className="rtl:rotate-180" />
          {t("back")}
        </Link>
      </Button>
    </main>
  );
}
