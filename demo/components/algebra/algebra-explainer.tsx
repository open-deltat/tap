"use client";

import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { CalendarStack } from "./calendar-stack";
import { IntersectionTrack } from "./intersection-track";
import { AlgebraPanel } from "./algebra-panel";
import { pctOf, totalHours, STEP_CAPTIONS, HOUR_MS, type Span } from "@/lib/algebra";
import type { AvailabilitySlot, Booking, Hold } from "@/lib/schemas";

export interface PersonData {
  name: string;
  open: Span[];
  blocking: Span[];
  bookings: Booking[];
  holds: Hold[];
  net: Span[];
  bufferMs: number;
}

interface AlgebraExplainerProps {
  bob: PersonData;
  dora: PersonData;
  combined: AvailabilitySlot[];
  axisStart: number;
  axisEnd: number;
  step: number;
  collapsed: Set<"bob" | "dora">;
  onToggleCollapse: (who: "bob" | "dora") => void;
  myHold: { start: number; end: number } | null;
  onPickIntersection: (slot: AvailabilitySlot) => void;
  /** First instant both are free (ms) — the vertical proof guide. */
  firstJointMs: number | null;
  minDurationMs: number;
}

const LEGEND: { label: string; cls: string }[] = [
  { label: "open", cls: "bg-zinc-400/30 ring-1 ring-white/10" },
  { label: "blocking", cls: "bg-red-500/40" },
  { label: "booking", cls: "bg-red-600/60" },
  { label: "hold", cls: "bg-amber-400/70" },
  { label: "net", cls: "bg-emerald-500/60" },
];

export function AlgebraExplainer({
  bob,
  dora,
  combined,
  axisStart,
  axisEnd,
  step,
  collapsed,
  onToggleCollapse,
  myHold,
  onPickIntersection,
  firstJointMs,
  minDurationMs,
}: AlgebraExplainerProps) {
  const ticks: number[] = [];
  for (let t = axisStart; t <= axisEnd; t += HOUR_MS) ticks.push(t);
  const pct = (ms: number) => pctOf(ms, axisStart, axisEnd);

  const showCombined = STEP_CAPTIONS[step]?.layers.includes("combined");
  const showGuide = firstJointMs != null && step >= 4;

  return (
    <div className="select-none">
      {/* legend */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn("h-2.5 w-4 rounded-sm", l.cls)} />
            {l.label}
          </span>
        ))}
      </div>

      {/* the whole grid shares ONE ruler; the guide line spans all rows */}
      <div className="relative">
        {showGuide && firstJointMs != null && (
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-0 top-6 z-10 w-px bg-emerald-400/40"
            style={{ left: `calc(68px + 12px + (100% - 68px - 12px - 88px - 12px) * ${pct(firstJointMs) / 100})` }}
          >
            <span className="absolute -top-1 left-1 whitespace-nowrap text-[9px] font-medium text-emerald-300">
              first joint slot {formatTime(firstJointMs)}
            </span>
          </div>
        )}

        {/* shared hour ruler */}
        <div className="flex items-stretch gap-3">
          <div className="w-[68px] shrink-0" />
          <div className="relative h-5 flex-1">
            {ticks.map((t) => (
              <div
                key={t}
                className="absolute -translate-x-1/2 text-[10px] tabular-nums text-zinc-500"
                style={{ left: `${pct(t)}%` }}
              >
                {formatTime(t)}
              </div>
            ))}
          </div>
          <div className="w-[88px] shrink-0" />
        </div>

        <div className="mt-2 space-y-4">
          <CalendarStack
            name={bob.name}
            open={bob.open}
            blocking={bob.blocking}
            bookings={bob.bookings}
            holds={bob.holds}
            net={bob.net}
            bufferMs={bob.bufferMs}
            axisStart={axisStart}
            axisEnd={axisEnd}
            step={step}
            collapsed={collapsed.has("bob")}
            onToggle={() => onToggleCollapse("bob")}
          />

          <div className="h-px bg-white/5" />

          <CalendarStack
            name={dora.name}
            open={dora.open}
            blocking={dora.blocking}
            bookings={dora.bookings}
            holds={dora.holds}
            net={dora.net}
            bufferMs={dora.bufferMs}
            axisStart={axisStart}
            axisEnd={axisEnd}
            step={step}
            collapsed={collapsed.has("dora")}
            onToggle={() => onToggleCollapse("dora")}
          />

          <div className="h-px bg-emerald-400/10" />

          <div className={cn("transition-opacity duration-300", !showCombined && "opacity-30")}>
            <IntersectionTrack
              combined={combined}
              myHold={myHold}
              minDurationMs={minDurationMs}
              axisStart={axisStart}
              axisEnd={axisEnd}
              onPick={onPickIntersection}
            />
          </div>
        </div>
      </div>

      {/* summary stats */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[11px] text-zinc-500">
        <span>
          Bob net: <span className="text-zinc-300">{totalHours(bob.net).toFixed(1)}h</span>
        </span>
        <span>
          Dora net: <span className="text-zinc-300">{totalHours(dora.net).toFixed(1)}h</span>
        </span>
        <span>
          Both free: <span className="text-emerald-300">{totalHours(combined).toFixed(1)}h</span>
        </span>
        {firstJointMs != null && (
          <span className="text-zinc-500">
            Dora&apos;s 09–12 bookings are the bottleneck — once she frees at{" "}
            <span className="text-emerald-300">{formatTime(firstJointMs)}</span>, Bob&apos;s extra 09–10 slot doesn&apos;t help.
          </span>
        )}
      </div>

      <AlgebraPanel
        bobOpen={bob.open}
        bobBlocking={bob.blocking}
        bobBookings={bob.bookings}
        bobNet={bob.net}
        doraNet={dora.net}
        combined={combined}
      />
    </div>
  );
}
