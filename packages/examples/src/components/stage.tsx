"use client";

import type { ReactNode } from "react";
import { cn } from "@open-deltat/shared/utils";
import { useStageMode } from "./stage-mode";

export interface StagePrimitive {
  /** What deltat capability this demo proves, e.g. "Collision + Hold · seat timeline". */
  label: string;
  /** Optional spec ID tag, e.g. "AVAIL-02". */
  specId?: string;
}

/**
 * The shared surface for every booking demo: a title, one quiet line naming the Δt capability it
 * proves, one surface holding the example, and the island: a floating bar at the bottom that is the
 * only place you ever act. On phones the surface goes edge to edge (no card inside the page) and the
 * island pins to the visible viewport bottom, clear of the home indicator.
 *
 * Inside another page (see StageMode "inline") the example is a block in that page's flow: the page
 * scrolls, never the example, the host supplies the title, and the island sits at the block's foot.
 * In a gallery preview ("bare") the title and caption are left out: the card is the picture.
 */
export function Stage({
  primitive,
  title,
  ribbon,
  tray,
  children,
  contentMax = "max-w-5xl",
}: {
  primitive?: StagePrimitive;
  title?: string;
  ribbon?: ReactNode;
  tray?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width for the panel. Widen it for multi-column demos (e.g. the live mirrors). */
  contentMax?: string;
}) {
  const mode = useStageMode();
  const inline = mode === "inline";
  const chrome = mode === "page";
  return (
    <div className={cn("relative flex flex-col text-dt-ink", !inline && "dt-canvas h-full overflow-hidden")}>
      <div className={cn("flex min-h-0 flex-1 flex-col items-center", inline ? "pb-24 sm:pb-28" : "overflow-auto pb-32", !chrome && !inline && "pt-4 sm:pt-6")}>
        {chrome && (title || primitive) && (
          <header className="w-full shrink-0 px-5 pb-5 pt-8 text-center sm:pt-12">
            {title && (
              <h1 className="text-balance text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] text-dt-ink sm:text-[2rem]">
                {title}
              </h1>
            )}
            {primitive && (
              <p className="mx-auto mt-2 flex max-w-md flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[13px] text-dt-ink-3">
                <span className="text-balance">{primitive.label}</span>
                {primitive.specId && (
                  <span className="rounded-full border border-dt-line px-2 py-px font-mono text-[10.5px] text-dt-ink-3">
                    {primitive.specId}
                  </span>
                )}
              </p>
            )}
          </header>
        )}

        {chrome && ribbon && <div className="w-full shrink-0 px-4 pb-5">{ribbon}</div>}

        <div className={cn("w-full", inline ? "max-w-none px-0" : `px-0 sm:px-6 ${contentMax}`)}>
          <div className="w-full bg-transparent px-4 py-2 sm:rounded-[28px] sm:border sm:border-dt-line sm:bg-dt-surface sm:p-7 sm:shadow-dt-surface">
            {children}
          </div>
        </div>
      </div>

      {tray && (
        <div
          className={cn(
            "pointer-events-none inset-x-0 bottom-0 flex justify-center px-3",
            inline ? "absolute z-10 pb-4 sm:pb-6" : "fixed z-30 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:absolute sm:pb-6"
          )}
        >
          <div className="dt-rise pointer-events-auto w-full max-w-xl rounded-[22px] border border-dt-line bg-dt-raised p-2.5 pl-4 shadow-dt-float backdrop-blur-xl backdrop-saturate-150">
            {tray}
          </div>
        </div>
      )}
    </div>
  );
}
