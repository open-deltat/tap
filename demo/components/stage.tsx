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
}: {
  primitive?: StagePrimitive;
  title?: string;
  ribbon?: ReactNode;
  tray?: ReactNode;
  children: ReactNode;
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

        <div className="flex w-full max-w-5xl flex-1 items-center justify-center overflow-auto px-6 pb-28">
          <div className="w-full rounded-2xl border border-white/[0.06] bg-white/[0.025] p-6 shadow-2xl shadow-black/50">
            {children}
          </div>
        </div>
      </div>

      {tray && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-4">
          <div className="pointer-events-auto w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-900/85 p-3 shadow-2xl shadow-black/50 backdrop-blur-md">
            {tray}
          </div>
        </div>
      )}
    </div>
  );
}
