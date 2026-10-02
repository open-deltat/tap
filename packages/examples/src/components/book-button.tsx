"use client";

import type { ComponentProps } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@open-deltat/shared/utils";
import { ACCENT_CTA } from "../lib/accent";

// The one and only "commit" button: the action that lives in the Stage tray on every example, so the
// booker looks and sits the same everywhere. While `loading` the label stays in place (invisible) under
// a centred spinner, so the button never changes width, and it is disabled.
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
      aria-busy={loading}
      className={cn("relative h-11 px-6 text-sm font-semibold sm:h-10", ACCENT_CTA, className)}
    >
      <span className={cn(loading && "invisible")}>{children}</span>
      {loading && <Loader2 aria-hidden className="absolute size-4 animate-spin motion-reduce:animate-none" />}
    </Button>
  );
}
