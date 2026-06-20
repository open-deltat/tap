"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PILL_ACTIVE, PILL_BASE, PILL_IDLE } from "@/lib/accent";

export interface SegmentedItem<T> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
}

// The single rounded-full pill selector used for every small, single-choice control across the demos:
// venue/flight/screen ribbons, duration and party-size toggles, discrete time/start chips. One look,
// one keyboard/aria contract, everywhere.
export function Segmented<T extends string | number>({
  items,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  items: SegmentedItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className={cn("flex flex-wrap items-center justify-center gap-1.5", className)}>
      {items.map((it) => {
        const active = it.value === value;
        return (
          <button
            key={String(it.value)}
            type="button"
            disabled={it.disabled}
            aria-pressed={active}
            onClick={() => onChange(it.value)}
            className={cn(PILL_BASE, active ? PILL_ACTIVE : PILL_IDLE)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
