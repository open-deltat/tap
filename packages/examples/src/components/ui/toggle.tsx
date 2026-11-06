"use client";

import * as React from "react";
import { Toggle as TogglePrimitive } from "radix-ui";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@open-deltat/shared/utils";

const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,transform] duration-150 outline-none active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-dt-ink/20 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border border-dt-line-strong bg-dt-surface text-dt-ink-2 hover:text-dt-ink data-[state=on]:border-transparent data-[state=on]:bg-dt-ink data-[state=on]:text-dt-on-ink",
        ghost:
          "bg-transparent text-dt-ink-2 hover:bg-dt-taken hover:text-dt-ink data-[state=on]:bg-dt-ink data-[state=on]:text-dt-on-ink",
      },
      size: {
        default: "h-11 px-3 min-w-11 sm:h-9 sm:min-w-9",
        sm: "h-9 px-3 text-xs min-w-9 sm:h-7 sm:px-2.5 sm:min-w-7",
        lg: "h-11 px-3.5 min-w-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

function Toggle({
  className,
  variant,
  size,
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root data-slot="toggle" className={cn(toggleVariants({ variant, size, className }))} {...props} />
  );
}

export { Toggle, toggleVariants };
