"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Archive, Pencil, Plus, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type {
  ProductActionResult,
  ProductListItem,
} from "@/lib/products/catalog.types";
import { productFieldsSchema } from "@/lib/products/product.validation";
import { useRouter } from "@/i18n/navigation";
import {
  createProductAction,
  updateProductAction,
  archiveProductAction,
  reactivateProductAction,
} from "../actions";

const fieldStyle =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const fieldIds = {
  sku: "product-sku",
  name: "product-name",
  categoryCode: "product-category",
  unitCode: "product-unit",
} as const;
type ProductField = keyof typeof fieldIds;
type ActionError = Extract<ProductActionResult, { ok: false }>["code"];

export function ProductEditor({
  product,
  contextVersion,
  onSuccess,
}: {
  product?: ProductListItem;
  contextVersion: number;
  onSuccess: () => void;
}) {
  const t = useTranslations("Products");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError>();
  const [fieldErrors, setFieldErrors] = useState<
    Partial<Record<ProductField, boolean>>
  >({});
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = productFieldsSchema.safeParse(Object.fromEntries(form));
    const invalid: Partial<Record<ProductField, boolean>> = {};
    if (!result.success) {
      for (const issue of result.error.issues) {
        const field = issue.path[0];
        if (
          field === "sku" ||
          field === "name" ||
          field === "categoryCode" ||
          field === "unitCode"
        )
          invalid[field] = true;
      }
    }
    setFieldErrors(invalid);
    setError(undefined);
    if (!result.success) return;
    startTransition(async () => {
      try {
        const input = { ...result.data, expectedVersion: contextVersion };
        const response = product
          ? await updateProductAction({ ...input, id: product.id })
          : await createProductAction(input);
        if (!response.ok) {
          setError(response.code);
          return;
        }
        onSuccess();
        setOpen(false);
      } catch {
        setError("UNAVAILABLE");
      }
    });
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError(undefined);
          setFieldErrors({});
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant={product ? "ghost" : "default"}
          size={product ? "icon" : "default"}
          aria-label={
            product ? t("actions.editLabel", { name: product.name }) : undefined
          }
        >
          {product ? (
            <Pencil aria-hidden="true" />
          ) : (
            <>
              <Plus aria-hidden="true" />
              {t("actions.add")}
            </>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={t("actions.close")}
        className="w-96"
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <SheetTitle className="mt-12 text-lg font-semibold">
          {t(product ? "form.editTitle" : "form.createTitle")}
        </SheetTitle>
        <SheetDescription className="mt-2 mb-6 text-sm text-muted-foreground">
          {t("form.description")}
        </SheetDescription>
        <form
          onSubmit={submit}
          className="space-y-5"
          noValidate
          aria-busy={pending}
        >
          {(["sku", "name", "categoryCode", "unitCode"] as const).map(
            (field) => (
              <div key={field} className="space-y-2">
                <label
                  htmlFor={fieldIds[field]}
                  className="block text-sm font-medium"
                >
                  {t(`form.fields.${field}`)}
                </label>
                <input
                  id={fieldIds[field]}
                  name={field}
                  defaultValue={product?.[field] ?? ""}
                  maxLength={
                    field === "name" ? 200 : field === "unitCode" ? 32 : 64
                  }
                  required
                  disabled={pending}
                  autoComplete="off"
                  className={`${fieldStyle}${field === "name" ? "" : " text-ltr"}`}
                  aria-invalid={fieldErrors[field] || undefined}
                  aria-describedby={
                    fieldErrors[field] ? `${fieldIds[field]}-error` : undefined
                  }
                  onChange={() =>
                    setFieldErrors((current) => ({
                      ...current,
                      [field]: false,
                    }))
                  }
                />
                {fieldErrors[field] ? (
                  <p
                    id={`${fieldIds[field]}-error`}
                    className="text-sm text-destructive"
                  >
                    {t(`validation.${field}`)}
                  </p>
                ) : null}
              </div>
            ),
          )}
          <div role="status" aria-live="polite">
            {error ? (
              <p className="rounded-md border border-destructive p-3 text-sm text-destructive">
                {t(`errors.${error}`)}
              </p>
            ) : null}
          </div>
          {error === "STALE_CONTEXT" ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => router.refresh()}
              disabled={pending}
            >
              {t("actions.refreshWorkspace")}
            </Button>
          ) : null}
          <Button type="submit" className="w-full" disabled={pending}>
            {t(
              pending
                ? "actions.saving"
                : product
                  ? "actions.save"
                  : "actions.create",
            )}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function ProductLifecycle({
  product,
  contextVersion,
  onSuccess,
}: {
  product: ProductListItem;
  contextVersion: number;
  onSuccess: () => void;
}) {
  const t = useTranslations("Products");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<ActionError>();
  const archive = product.status === "ACTIVE";
  function confirm() {
    startTransition(async () => {
      setError(undefined);
      try {
        const action = archive ? archiveProductAction : reactivateProductAction;
        const result = await action({
          id: product.id,
          expectedVersion: contextVersion,
        });
        if (!result.ok) {
          setError(result.code);
          return;
        }
        onSuccess();
        setOpen(false);
      } catch {
        setError("UNAVAILABLE");
      }
    });
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!pending) {
          setOpen(value);
          setError(undefined);
        }
      }}
    >
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t(
            archive ? "actions.archiveLabel" : "actions.reactivateLabel",
            { name: product.name },
          )}
        >
          {archive ? (
            <Archive aria-hidden="true" />
          ) : (
            <RotateCcw aria-hidden="true" />
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        closeLabel={t("actions.close")}
        className="w-96"
        onEscapeKeyDown={(event) => {
          if (pending) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (pending) event.preventDefault();
        }}
      >
        <SheetTitle className="mt-12 text-lg font-semibold">
          {t(archive ? "confirm.archiveTitle" : "confirm.reactivateTitle")}
        </SheetTitle>
        <SheetDescription className="mt-3 mb-6 text-sm leading-6 text-muted-foreground">
          {t(
            archive
              ? "confirm.archiveDescription"
              : "confirm.reactivateDescription",
            { name: product.name },
          )}
        </SheetDescription>
        <div role="status" aria-live="polite">
          {error ? (
            <p className="mb-4 text-sm text-destructive">
              {t(`errors.${error}`)}
            </p>
          ) : null}
        </div>
        {error === "STALE_CONTEXT" ? (
          <Button
            type="button"
            variant="outline"
            className="mb-3"
            onClick={() => router.refresh()}
            disabled={pending}
          >
            {t("actions.refreshWorkspace")}
          </Button>
        ) : null}
        <Button onClick={confirm} disabled={pending}>
          {t(
            pending
              ? "actions.saving"
              : archive
                ? "actions.confirmArchive"
                : "actions.confirmReactivate",
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
}
