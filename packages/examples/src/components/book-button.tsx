"use client";

import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@open-deltat/shared/utils";
import { ACCENT_CTA } from "../lib/accent";

// The one and only "commit" button: the action that lives in the Stage tray on every example, so the
// booker looks and sits the same everywhere. `loading` swaps the label for a spinner and disables it.
export function BookButton({
  children,
  loading,
  className,
  disabled,
  ...props
}: ComponentProps<typeof Button> & { loading?: boolean }) {
  return (
    <Button
      {...props}
      disabled={disabled || loading}
      className={cn("h-10 px-6 text-sm font-semibold", ACCENT_CTA, className)}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : children}
    </Button>
  );
}
