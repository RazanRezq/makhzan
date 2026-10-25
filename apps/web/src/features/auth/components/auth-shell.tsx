import { Boxes } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type AuthShellProps = {
  children: ReactNode;
  description: string;
  title: string;
};

export async function AuthShell({
  children,
  description,
  title,
}: AuthShellProps) {
  const t = await getTranslations("Brand");

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10 sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Boxes className="size-6" aria-hidden="true" />
          </span>
          <span>
            <span className="block text-xl font-semibold tracking-tight">
              {t("name")}
            </span>
            <span className="block text-xs text-muted-foreground">
              {t("tagline")}
            </span>
          </span>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </main>
  );
}
