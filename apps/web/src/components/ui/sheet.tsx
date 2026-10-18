"use client";

import type { ComponentProps } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;
const SheetTrigger = Dialog.Trigger;
const SheetTitle = Dialog.Title;
const SheetDescription = Dialog.Description;

function SheetContent({
  className,
  children,
  closeLabel,
  ...props
}: ComponentProps<typeof Dialog.Content> & { closeLabel: string }) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay" />
      <Dialog.Content
        data-slot="sheet-content"
        className={cn(
          "fixed inset-y-0 start-0 z-50 flex h-dvh w-72 max-w-[calc(100%-3rem)] flex-col overflow-y-auto border-e bg-sidebar p-5 text-foreground shadow-xl",
          className,
        )}
        {...props}
      >
        {children}
        <Dialog.Close className="absolute end-3 top-3 flex size-11 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground">
          <X className="size-5" aria-hidden="true" />
          <span className="sr-only">{closeLabel}</span>
        </Dialog.Close>
      </Dialog.Content>
    </Dialog.Portal>
  );
}

export { Sheet, SheetTrigger, SheetTitle, SheetDescription, SheetContent };
