import { cn } from "@/lib/utils";

// The hold lifecycle as a small state diagram: Free, Held, then Held branches to Booked or back to
// Free, with Person B's blocked attempt as a self-loop. Static, read it like a flowchart.

type Tone = "free" | "hold" | "booked";

function Node({ tone, title, sub }: { tone: Tone; title: string; sub: string }) {
  const cls =
    tone === "free"
      ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-100"
      : tone === "hold"
        ? "border-amber-300/50 bg-amber-400/15 text-amber-100"
        : "border-sky-400/50 bg-sky-500/20 text-sky-100";
  return (
    <div className={cn("w-40 rounded-lg border px-3 py-2 text-center", cls)}>
      <div className="text-[12px] font-semibold">{title}</div>
      <div className="text-[9.5px] opacity-80">{sub}</div>
    </div>
  );
}

function Conn({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center py-0.5 text-zinc-500">
      <span className="text-[11px] leading-none">↓</span>
      <span className="mt-0.5 text-center text-[8.5px] leading-tight">{label}</span>
    </div>
  );
}

export function HoldsFlow() {
  return (
    <div className="mx-auto max-w-md">
      <div className="flex flex-col items-center">
        <Node tone="free" title="Free" sub="seat is open" />
        <Conn label="Person A taps" />

        <div className="relative">
          <Node tone="hold" title="Held" sub="reserved for A · timer ticking" />
          <span className="absolute left-full top-1/2 ml-2 -translate-y-1/2 whitespace-nowrap rounded-full border border-rose-400/40 bg-rose-500/15 px-2 py-0.5 text-[9px] text-rose-200">
            ↺ Person B taps, refused
          </span>
        </div>

        {/* Held branches two ways */}
        <div className="mt-1 grid w-full max-w-sm grid-cols-2 gap-4">
          <div className="flex flex-col items-center">
            <Conn label="A confirms" />
            <Node tone="booked" title="Booked" sub="it's theirs" />
          </div>
          <div className="flex flex-col items-center">
            <Conn label="timer runs out, or A disconnects" />
            <Node tone="free" title="Free again" sub="released on its own" />
          </div>
        </div>
      </div>
    </div>
  );
}
