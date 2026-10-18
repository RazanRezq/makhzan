"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type SelectionCheckboxProps = {
  checked: boolean | "indeterminate";
  label: string;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
};

export function SelectionCheckbox({
  checked,
  label,
  onCheckedChange,
  disabled = false,
  className,
}: SelectionCheckboxProps) {
  const checkboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (checkboxRef.current) {
      checkboxRef.current.indeterminate = checked === "indeterminate";
    }
  }, [checked]);

  return (
    <label
      className={cn(
        "inline-flex size-11 cursor-pointer items-center justify-center rounded-md focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background has-disabled:cursor-not-allowed has-disabled:opacity-60",
        className,
      )}
    >
      <input
        ref={checkboxRef}
        type="checkbox"
        checked={checked === true}
        disabled={disabled}
        aria-label={label}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="size-4 cursor-pointer accent-primary disabled:cursor-not-allowed"
      />
    </label>
  );
}
