"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Check, RefreshCw, RotateCcw } from "lucide-react";

const ROWS = ["14:00", "14:30", "15:00", "15:30"] as const;
type Row = (typeof ROWS)[number];

// The same moment on two calendars. On a calendar that is copied and checked now and then, both
// bookings land in one slot. On Δt the second is refused with a time that still works, and takes
// it. Nothing here is invented: the refusal with alternatives is what the kernel and the MCP
// server answer today.
type Frame = 0 | 1 | 2 | 3;
const SCRIPT: readonly { at: number; frame: Frame }[] = [
  { at: 1000, frame: 1 },
  { at: 1900, frame: 2 },
  { at: 2900, frame: 3 },
];
const END: Frame = 3;

export function WithWithout() {
  const [frame, setFrame] = useState<Frame>(0);
  const [run, setRun] = useState(0);

  useEffect(() => {
    // Under reduced motion the scene shows its end state at once; otherwise it plays from the start.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const steps: readonly { at: number; frame: Frame }[] = reduce ? [{ at: 0, frame: END }] : [{ at: 0, frame: 0 }, ...SCRIPT];
    const timers = steps.map((s) => window.setTimeout(() => setFrame(s.frame), s.at));
    return () => timers.forEach(clearTimeout);
  }, [run]);

  return (
    <div className="mx-auto mt-14 max-w-4xl sm:mt-20">
      <div className="grid gap-3 md:grid-cols-2">
        <Calendar
          title="Your calendar today"
          status={
            <>
              <RefreshCw className="h-3 w-3" />
              updated 4 min ago
            </>
          }
          bookings={{ "14:30": frame >= 2 ? ["Agent A", "Agent B"] : frame >= 1 ? ["Agent A"] : [] }}
          note={frame >= 2 ? "Both bookings went in. Two people, one slot." : ""}
        />
        <Calendar
          title="With Δt"
          status={
            <>
              <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
              live
            </>
          }
          bookings={{ "14:30": frame >= 1 ? ["Agent A"] : [], "15:00": frame >= 3 ? ["Agent B"] : [] }}
          offered={frame === 2 ? "15:00" : undefined}
          note={frame >= 3 ? "Both got a time. Nobody got the same one." : frame >= 2 ? "Agent B is told: 14:30 is taken, 15:00 is free." : ""}
          done={frame >= 3}
          highlight
        />
      </div>

      <div className="mt-4 flex flex-col items-center justify-center gap-x-5 gap-y-1 text-center text-[13px] text-dt-ink-3 sm:flex-row">
        <span>Agent A, on a phone call, and Agent B, in a web chat, both book Tuesday 14:30 at the same moment.</span>
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

function Calendar({
  title,
  status,
  bookings,
  offered,
  note,
  done,
  highlight,
}: {
  title: string;
  status: ReactNode;
  bookings: Partial<Record<Row, readonly string[]>>;
  /** A row Δt has just offered to the refused agent, drawn as a dashed outline until it is taken. */
  offered?: Row;
  note: string;
  /** The scene has reached its good end on this calendar. */
  done?: boolean;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-3xl border bg-dt-surface p-5 shadow-dt-float sm:p-6 ${highlight ? "border-dt-accent/40" : "border-dt-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">{title}</div>
        <span className="inline-flex items-center gap-1.5 text-[12px] text-dt-ink-3">{status}</span>
      </div>

      <div className="mt-4 text-[12px] text-dt-ink-3">Tuesday</div>
      <div className="mt-1 divide-y divide-dt-line border-y border-dt-line">
        {ROWS.map((t) => {
          const who = bookings[t] ?? [];
          const clash = who.length > 1;
          return (
            // Fixed row height: bookings arrive without the calendar growing.
            <div key={t} className="flex min-h-[48px] items-center gap-3 py-1.5">
              <span className="w-11 shrink-0 font-mono text-[12px] tabular-nums text-dt-ink-3">{t}</span>
              <div className="flex min-w-0 flex-1 gap-1.5">
                {who.map((name, k) => (
                  // The second booking into one slot lands with the amber ping the examples use for
                  // "someone else just acted": the moment the old calendar goes wrong.
                  <span
                    key={name}
                    className={`dt-rise inline-flex h-8 flex-1 items-center justify-center rounded-lg text-[12.5px] font-medium ${
                      clash ? `border border-dt-held/40 bg-dt-held-soft text-dt-held-ink ${k === 1 ? "dt-ping" : ""}` : "bg-dt-ink text-dt-on-ink"
                    }`}
                  >
                    {name}
                  </span>
                ))}
                {offered === t && (
                  <span className="dt-rise inline-flex h-8 flex-1 items-center justify-center rounded-lg border border-dashed border-dt-accent text-[12.5px] text-dt-accent-ink">
                    free for Agent B
                  </span>
                )}
              </div>
              {clash && <span className="dt-rise shrink-0 text-[11.5px] font-medium text-dt-held-ink">double booked</span>}
            </div>
          );
        })}
      </div>

      {/* Fixed line height, so the sentence fades in without moving the card. The Δt side ends on a
          tick: the settled end of the scene, the same mark the examples use when a booking lands. */}
      <p className={`mt-4 flex min-h-5 items-center gap-1.5 text-[13.5px] leading-5 text-dt-ink-2 transition-opacity duration-300 ${note ? "opacity-100" : "opacity-0"}`}>
        {done && <Check className="dt-rise h-4 w-4 shrink-0 text-dt-accent" strokeWidth={2.5} />}
        {note || " "}
      </p>
    </div>
  );
}
