"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { SeatRow, FOCUS_SEAT, type SeatState, type LaneSnapshot } from "./seat-row";

const SEATS = 6;
const all = (): SeatState[] => Array.from({ length: SEATS }, () => "free");
// All free, with a few seats overridden.
const row = (...overrides: [number, SeatState][]): SeatState[] => {
  const s = all();
  for (const [i, st] of overrides) s[i] = st;
  return s;
};

const LEGEND = [
  { label: "free", cls: "border-emerald-400/40 bg-emerald-500/20" },
  { label: "on hold", cls: "border-amber-300/70 bg-amber-400/30" },
  { label: "booked", cls: "border-sky-400/70 bg-sky-500/35" },
  { label: "turned away", cls: "border-red-400/80 bg-red-500/35" },
];

function Step({ title, caption, bob, jane }: { title: string; caption: string; bob: LaneSnapshot; jane: LaneSnapshot }) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] p-3">
      <div className="text-[12.5px] font-medium text-zinc-100">{title}</div>
      <div className="mt-2">
        <SeatRow label="Bob" lane={bob} pulseFocus={bob.acting} />
        <div className="my-1.5 h-px bg-white/10" />
        <SeatRow label="Jane" lane={jane} pulseFocus={jane.acting} />
      </div>
      <p className="mt-2 text-[11.5px] leading-relaxed text-zinc-400">{caption}</p>
    </div>
  );
}

// A small tick from the branch spine to each outcome card, so the indent reads as a tree.
function Branch({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <span className="absolute -left-5 top-6 h-px w-4 bg-white/15" />
      {children}
    </div>
  );
}

const Down = () => <div className="ml-[31px] h-3 w-px bg-white/20" />;

// Holds + races as a tree you read top down: the seat is a block on a line, Bob puts a hold on it,
// then one of three things happens next. Each node keeps Bob's and Jane's live view of the seats.
export function HoldsStatic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Two people, one seat</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Holds and races</h2>
      <p className="mt-1 text-sm text-emerald-300/90">What stops two people grabbing the same seat at once.</p>

      <p className="mt-4 text-[13px] leading-relaxed text-zinc-400">
        A booking is just a block on the seat&apos;s line of time, so a booked seat is taken and an empty
        one is free. A <span className="text-amber-200">hold</span> is a block with a short timer: it
        marks the seat taken for everyone the instant someone taps it, then lets go on its own if they
        do not confirm. That tiny timer is what stops a race.
      </p>

      <div className="mt-4 flex flex-wrap gap-3 text-[10px] uppercase tracking-wider text-zinc-500">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className={cn("h-3 w-3 rounded-[4px] border", l.cls)} />
            {l.label}
          </span>
        ))}
      </div>

      <div className="mt-6 space-y-0">
        <Step
          title="Both see the same seats"
          caption="Bob and Jane open the same live seat map. Seat 4 is open, so either of them could take it."
          bob={{ seats: all() }}
          jane={{ seats: all() }}
        />
        <Down />
        <Step
          title="Bob taps seat 4"
          caption="Δt puts a hold on seat 4, and Jane sees it turn amber right away. It now counts as taken for everyone."
          bob={{ seats: row([FOCUS_SEAT, "hold"]), acting: true }}
          jane={{ seats: row([FOCUS_SEAT, "hold"]) }}
        />
      </div>

      <div className="mt-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Then one of three things happens</div>
      <div className="mt-2 space-y-3 border-l border-white/15 pl-5">
        <Branch>
          <Step
            title="Jane tries the same seat"
            caption="Jane taps seat 4 too, but it is held, so Δt turns her away. This is the race, and the hold settles it: one winner, no double booking."
            bob={{ seats: row([FOCUS_SEAT, "hold"]) }}
            jane={{ seats: row([FOCUS_SEAT, "reject"]), acting: true }}
          />
        </Branch>
        <Branch>
          <Step
            title="The hold runs out"
            caption="If Bob never confirms, the timer ends and the hold clears itself. Seat 4 turns green again, free for anyone. Nothing to clean up."
            bob={{ seats: all() }}
            jane={{ seats: all() }}
          />
        </Branch>
        <Branch>
          <Step
            title="Bob confirms"
            caption="If Bob confirms in time, the hold becomes a real booking in one step, with no gap where anyone could slip in."
            bob={{ seats: row([FOCUS_SEAT, "booked"]), acting: true }}
            jane={{ seats: row([FOCUS_SEAT, "booked"]) }}
          />
        </Branch>
      </div>
    </div>
  );
}
