import type { ReactNode } from "react";
import { cn } from "@open-deltat/shared/utils";
import { STAGE_CLASS, STAGE_VARS } from "../lib/accent";

export interface StagePrimitive {
  /** What deltat capability this demo proves, e.g. "Collision + Hold · seat timeline". */
  label: string;
  /** Optional spec ID tag, e.g. "AVAIL-02". */
  specId?: string;
}

// Crosshair registration marks centred on the panel's four corners, the way a technical drawing marks
// its frame. Decoration, so hidden from assistive tech and from phones, where the panel is full-bleed.
const MARK =
  "absolute hidden size-[11px] -translate-x-1/2 -translate-y-1/2 sm:block before:absolute before:left-1/2 before:top-0 before:h-full before:w-px before:bg-ink-3 after:absolute after:left-0 after:top-1/2 after:h-px after:w-full after:bg-ink-3";

function Marks() {
  return (
    <>
      <span aria-hidden className={cn(MARK, "left-0 top-0")} />
      <span aria-hidden className={cn(MARK, "left-full top-0")} />
      <span aria-hidden className={cn(MARK, "left-0 top-full")} />
      <span aria-hidden className={cn(MARK, "left-full top-full")} />
    </>
  );
}

/**
 * The shared surface for every booking demo, built as an instrument rather than a card: a flat
 * canvas, one hairline-framed panel with square corners, a left-aligned readout line above it naming
 * the deltat capability on show, and an optional action tray below. No glass, glow or gradient.
 *
 * One scroll container holds everything. The tray sits in the flow directly under the panel, next to
 * the thing it commits, and sticks to the bottom edge only when the panel is taller than the viewport.
 * From the small breakpoint up, header, panel and tray centre as a group so a short panel is not left
 * stranded; on a phone they start at the top.
 */
export function Stage({
  primitive,
  title,
  readout,
  ribbon,
  tray,
  children,
  contentMax = "max-w-5xl",
  flush = false,
}: {
  primitive?: StagePrimitive;
  title?: string;
  /** Right end of the header line, for live state such as the stream indicator. */
  readout?: ReactNode;
  ribbon?: ReactNode;
  tray?: ReactNode;
  children: ReactNode;
  /** Tailwind max-width for the panel. Widen it for multi-column demos (e.g. the live mirrors). */
  contentMax?: string;
  /** No panel padding: for content that draws its own rules edge to edge. */
  flush?: boolean;
}) {
  return (
    <div className={cn("relative h-full overflow-hidden bg-canvas text-ink", STAGE_CLASS)} style={STAGE_VARS}>
      <div className="h-full overflow-y-auto overscroll-contain">
        <div className="flex min-h-full flex-col items-center sm:px-8">
          <div className={cn("flex w-full flex-col gap-3 py-4 sm:my-auto sm:py-6", contentMax)}>
            {(title || primitive || readout) && (
              <header className="flex items-end justify-between gap-4 px-4 sm:px-0">
                <div className="min-w-0">
                  {title && <h1 className="text-balance text-base font-medium tracking-tight text-ink">{title}</h1>}
                  {primitive && (
                    <p className="flex flex-wrap items-baseline gap-x-2.5 text-[13px] text-ink-2">
                      {primitive.specId && <span className="font-mono text-xs">{primitive.specId}</span>}
                      <span className="text-pretty">{primitive.label}</span>
                    </p>
                  )}
                </div>
                {readout && <div className="shrink-0 pb-px">{readout}</div>}
              </header>
            )}

            {ribbon && <div className="px-4 sm:px-0">{ribbon}</div>}

            {/* On phones the panel goes edge-to-edge, so seat maps use the full viewport; sm: restores
                the framed panel. Demos that are not maps pad their own content on a phone. */}
            <div className={cn("@container relative w-full border-y border-line bg-panel sm:rounded-sharp sm:border", !flush && "sm:p-6")}>
              <Marks />
              {children}
            </div>

            {tray && (
              <div className="sticky bottom-0 z-30 sm:bottom-4">
                <div className="border-y border-line-strong bg-panel p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] transition-none animate-in fade-in-0 slide-in-from-bottom-1 duration-150 ease-out motion-reduce:animate-none sm:rounded-sharp sm:border sm:pb-3">
                  {tray}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
