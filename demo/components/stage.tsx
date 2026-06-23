import type { ReactNode } from "react";

export interface StagePrimitive {
  /** What deltat capability this demo proves, e.g. "Collision + Hold · seat timeline". */
  label: string;
  /** Optional spec ID tag, e.g. "AVAIL-02". */
  specId?: string;
}

/**
 * The shared single-pane surface for every booking demo: one luminous panel centered on a
 * dark void, a quiet primitive header naming the deltat capability, an optional control
 * ribbon, and an optional floating action tray. There is no left/right chrome — the panel
 * IS the example.
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
  return (
    <div className="relative h-full overflow-hidden bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative flex h-full flex-col items-center">
        <div className="shrink-0 pb-3 pt-8 text-center">
          {title && <div className="text-sm font-medium text-zinc-300">{title}</div>}
          {primitive && (
            <div className="mt-1.5 flex items-center justify-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
              <span>{primitive.label}</span>
              {primitive.specId && (
                <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal text-zinc-500">
                  {primitive.specId}
                </span>
              )}
            </div>
          )}
        </div>

        {ribbon && <div className="shrink-0 pb-4">{ribbon}</div>}

        {/* m-auto (not items-center) so a panel taller than the viewport top-anchors and stays
            fully scrollable — items-center would clip the top out of reach. */}
        <div className={`flex w-full flex-1 justify-center overflow-auto px-0 pb-28 sm:px-6 ${contentMax}`}>
          {/* On phones the panel goes edge-to-edge (no border/bg/padding) so the example uses the
              full viewport; sm: restores the floating panel, byte-identical to before. */}
          <div className="m-auto w-full rounded-none border-0 bg-transparent p-0 shadow-none sm:rounded-2xl sm:border sm:border-white/[0.06] sm:bg-white/[0.025] sm:p-6 sm:shadow-2xl sm:shadow-black/50">
            {children}
          </div>
        </div>
      </div>

      {/* fixed (not absolute) on mobile so the tray pins to the visible viewport bottom regardless
          of the tall scroll content; sm: reverts to absolute-in-Stage (desktop unchanged). The
          safe-area pad keeps the Book button clear of the iOS home indicator. */}
      {tray && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:absolute sm:p-4">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-900/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-md">
            {tray}
          </div>
        </div>
      )}
    </div>
  );
}
