import {
  ArrowDown,
  Boxes,
  ChartNoAxesCombined,
  CircleDashed,
  Package,
  Sprout,
  Warehouse,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireServerSession } from "@/server/auth/session";

export default async function OverviewPage({
  params,
}: PageProps<"/[locale]">) {
  const { locale } = await params;
  await requireServerSession(locale);
  const t = await getTranslations("Overview");
  const tools = [
    {
      title: "productsTitle",
      description: "productsDescription",
      icon: Package,
    },
    {
      title: "operationsTitle",
      description: "operationsDescription",
      icon: Warehouse,
    },
    {
      title: "reportsTitle",
      description: "reportsDescription",
      icon: ChartNoAxesCombined,
    },
  ] as const;

  return (
    <div className="space-y-8">
      <div>
        <p className="mb-2 text-xs font-semibold tracking-wider text-primary">
          {t("eyebrow")}{" "}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {t("description")}
        </p>
      </div>

      <section
        aria-labelledby="welcome-title"
        className="relative overflow-hidden rounded-2xl border bg-hero px-6 py-8 sm:px-9 sm:py-10"
      >
        <div className="relative z-10 max-w-lg">
          <p className="mb-5 inline-flex items-center gap-2 text-xs font-semibold text-primary">
            <Sprout className="size-4" aria-hidden="true" />
            {t("welcome")}
          </p>
          <h2
            id="welcome-title"
            className="whitespace-pre-line text-3xl leading-tight font-semibold tracking-tight sm:text-4xl"
          >
            {t("heroTitle")}
          </h2>
          <p className="mt-4 max-w-md text-sm leading-7 text-muted-foreground">
            {t("heroDescription")}
          </p>
          <Button asChild className="mt-6">
            <a href="#workspace-tools">
              {t("explore")}
              <ArrowDown aria-hidden="true" />
            </a>
          </Button>
        </div>
        <div
          className="absolute end-10 top-1/2 hidden -translate-y-1/2 xl:block"
          aria-hidden="true"
        >
          <div className="flex size-52 items-center justify-center rounded-full border border-primary/15">
            <div className="flex size-40 items-center justify-center rounded-full border border-primary/20 bg-card/40">
              <Boxes className="size-24 text-primary" strokeWidth={1} />
            </div>
          </div>
        </div>
      </section>

      <Card>
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>{t("activityTitle")}</CardTitle>
            <span className="rounded-full border bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
              {t("preview")}
            </span>
          </div>
          <CardDescription>{t("activityDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center px-5 py-10 text-center sm:py-12">
          <div className="mb-5 flex size-14 items-center justify-center rounded-2xl border bg-background">
            <CircleDashed className="size-7 text-primary" aria-hidden="true" />
          </div>
          <h3 className="text-base font-medium">{t("emptyTitle")}</h3>
          <p className="mt-3 max-w-lg text-sm leading-7 text-muted-foreground">
            {t("emptyDescription")}
          </p>
          <p className="mt-5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            {t("emptyLabel")}
          </p>
        </CardContent>
      </Card>

      <section
        id="workspace-tools"
        aria-labelledby="tools-title"
        className="scroll-mt-28"
      >
        <h2 id="tools-title" className="text-lg font-semibold tracking-tight">
          {t("toolsTitle")}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("toolsDescription")}
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {tools.map(({ title, description, icon: Icon }) => (
            <Card key={title}>
              <CardContent className="pt-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="rounded-full border px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
                    {t("comingSoon")}
                  </span>
                </div>
                <h3 className="text-sm font-semibold">{t(title)}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  {t(description)}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </div>
  );
}
