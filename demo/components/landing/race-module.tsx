"use client";

import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";

const SLOTS = ["13:30", "14:00", "14:30", "15:00", "15:30", "16:00"] as const;
const HOLD_SECONDS = 5 * 60;

// The race every agent loses on a copied calendar, played as Δt answers it: A holds the slot, B's
// identical hold a moment later is refused and already carries two times that still work. Every
// line is what the kernel and the MCP server answer today.
type Frame = 0 | 1 | 2 | 3 | 4;
const SCRIPT: readonly { at: number; frame: Frame }[] = [
  { at: 900, frame: 1 },
  { at: 1400, frame: 2 },
  { at: 2200, frame: 3 },
  { at: 2700, frame: 4 },
];
const END: Frame = 4;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function RaceModule() {
  const [frame, setFrame] = useState<Frame>(0);
  const [run, setRun] = useState(0);
  const [left, setLeft] = useState(HOLD_SECONDS);

  useEffect(() => {
    // Under reduced motion the race shows its end state at once; otherwise it plays from the start.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps: readonly { at: number; frame: Frame }[] = reduce ? [{ at: 0, frame: END }] : [{ at: 0, frame: 0 }, ...SCRIPT];
    const timers = [
      ...steps.map((s) => window.setTimeout(() => setFrame(s.frame), s.at)),
      window.setTimeout(() => setLeft(HOLD_SECONDS), 0),
    ];
    return () => timers.forEach(clearTimeout);
  }, [run]);

  // The hold's clock runs from the moment it is granted, so the number on screen is a real countdown.
  useEffect(() => {
    if (frame < 2) return;
    const id = window.setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [frame, run]);

  const held = frame >= 2;
  const refused = frame >= 4;

  return (
    <div className="mx-auto mt-14 max-w-3xl sm:mt-20">
      <div className="rounded-[28px] border border-dt-line bg-dt-surface p-4 shadow-dt-float sm:p-5">
        <div className="flex items-center gap-2 px-1 pb-4 text-[13px] font-medium">
          <span className="dt-breathe h-2 w-2 rounded-full bg-dt-accent" />
          Dr. Chen · Tuesday
        </div>

        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
          {SLOTS.map((t) => {
            const isHeld = t === "14:30" && held;
            const taken = t === "13:30";
            const offered = refused && (t === "15:00" || t === "15:30");
            return (
              <div
                key={t}
                className={[
                  "relative rounded-xl border py-3 text-center text-[13.5px] tabular-nums transition-[background-color,border-color,color] duration-300",
                  isHeld
                    ? "border-dt-ink bg-dt-ink font-semibold text-dt-on-ink"
                    : taken
                      ? "border-transparent text-dt-ink-3/60 line-through"
                      : "border-dt-line bg-dt-surface font-medium text-dt-ink-2",
                  offered ? "border-dt-accent ring-1 ring-inset ring-dt-accent" : "",
                ].join(" ")}
              >
                {t}
                {isHeld && (
                  <span
                    key={`${run}-${refused ? "ping" : "dot"}`}
                    className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dt-surface bg-dt-accent ${refused ? "dt-ping" : ""}`}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 grid divide-y divide-dt-line border-t border-dt-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          <Agent who="Agent A" via="on a phone call" ask={frame >= 1 ? "hold 14:30" : ""} reply={frame >= 2 ? `held · ${mmss(left)} left` : ""} tone="ok" />
          <Agent who="Agent B" via="in a web chat" ask={frame >= 3 ? "hold 14:30" : ""} reply={frame >= 4 ? "taken · try 15:00 or 15:30" : ""} tone="refused" />
        </div>
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-x-5 gap-y-1 text-center text-[13px] text-dt-ink-3 sm:flex-row">
        <span>Two agents want the same slot at the same moment. One gets it. The other gets two times that still work.</span>
        <button
          type="button"
          onClick={() => setRun((n) => n + 1)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 font-medium text-dt-ink transition-colors hover:text-dt-accent-ink sm:min-h-0"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Replay
        </button>
      </div>
    </div>
  );
}

function Agent({ who, via, ask, reply, tone }: { who: string; via: string; ask: string; reply: string; tone: "ok" | "refused" }) {
  return (
    <div className="py-4 sm:px-5 sm:first:pl-1 sm:last:pr-1">
      <div className="text-[13px]">
        <span className="font-semibold">{who}</span>
        <span className="text-dt-ink-3"> {via}</span>
      </div>
      {/* Two fixed lines, so the card never changes height as the race plays. */}
      <div className="mt-2 space-y-1 font-mono text-[12.5px]">
        <Line text={ask ? `→ ${ask}` : ""} className="text-dt-ink-2" />
        <Line text={reply ? `← ${reply}` : ""} className={tone === "ok" ? "text-dt-accent-ink" : "text-dt-held-ink"} />
      </div>
    </div>
  );
}

function Line({ text, className }: { text: string; className: string }) {
  return (
    <div className={`h-5 truncate transition-opacity duration-300 ${text ? "opacity-100" : "opacity-0"} ${className}`} aria-live="polite">
      {text || " "}
    </div>
  );
}
