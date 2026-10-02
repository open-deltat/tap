"use client";

import { useEffect, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@open-deltat/shared/utils";
import { formatTimeRange } from "@open-deltat/shared/time";
import { BookButton } from "../../components/book-button";
import { longDay as longDate } from "../../components/time-field-shared";
import { Button } from "../../components/ui/button";
import { countdown, durationLabel, type BusySlot, type HeldSlot, type Slot } from "../../lib/day-field";

function Countdown({ until, skew }: { until: number; skew: number }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <>{countdown(until - (Date.now() + skew))}</>;
}

const stepButton =
  "grid size-11 touch-manipulation place-items-center border border-line-strong text-ink outline-none transition-colors hover:bg-line focus-visible:ring-2 focus-visible:ring-signal disabled:opacity-40 disabled:hover:bg-transparent sm:size-9";

/**
 * The action bar. It is a permanent slot in the layout (EX-17): the same grid in all three states, so a
 * choice changes what is written in it and never how tall it is. Nothing chosen: a prompt and a Book
 * button that waits. A time chosen: the interval, how long it is held for you, a stepper to make it
 * longer or shorter, and Book. One of your own bookings opened: when it clears and a way to cancel it.
 */
export function FieldTray({
  selection,
  held,
  booking,
  managed,
  skew,
  slotMs,
  canGrow,
  canShrink,
  onStep,
  onBook,
  onCancel,
  cancelling,
}: {
  selection: Slot | null;
  /** The hold the server confirms is yours, once it has placed it. */
  held: HeldSlot | null;
  booking: boolean;
  managed: BusySlot | null;
  skew: number;
  slotMs: number;
  canGrow: boolean;
  canShrink: boolean;
  onStep: (step: 1 | -1) => void;
  onBook: () => void;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const span = managed ?? selection;
  const choosing = !managed && selection !== null;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2.5 sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
      <div className="min-w-0">
        <div className="truncate text-xs text-ink-2">{managed ? `Your booking, ${longDate(managed.start)}` : selection ? longDate(selection.start) : "Choose a time"}</div>
        <div className="whitespace-nowrap font-mono text-base font-medium tabular-nums text-ink">{span ? formatTimeRange(span.start, span.end) : "Drag along a day for longer"}</div>
      </div>

      <p role="status" aria-live="polite" className="min-w-[10ch] justify-self-end text-right font-mono text-xs tabular-nums sm:min-w-[14ch]">
        {managed?.expiresAt ? (
          <span className="text-ink-2">
            clears in <Countdown until={managed.expiresAt} skew={skew} />
          </span>
        ) : choosing && held ? (
          <span className="text-signal">
            held for you <Countdown until={held.expiresAt} skew={skew} />
          </span>
        ) : choosing ? (
          <span className="text-ink-2">holding…</span>
        ) : (
          " "
        )}
      </p>

      <div className="flex items-center justify-self-start" role="group" aria-label="Length">
        <button type="button" aria-label="Shorter" disabled={!choosing || !canShrink} onClick={() => onStep(-1)} className={cn(stepButton, "border-r-0")}>
          <Minus aria-hidden className="size-4" />
        </button>
        <span className="grid h-11 min-w-[5.5rem] place-items-center border border-line-strong px-2 font-mono text-xs tabular-nums text-ink sm:h-9">{durationLabel(span ? span.end - span.start : slotMs)}</span>
        <button type="button" aria-label="Longer" disabled={!choosing || !canGrow} onClick={() => onStep(1)} className={cn(stepButton, "border-l-0")}>
          <Plus aria-hidden className="size-4" />
        </button>
      </div>

      {managed ? (
        <Button variant="ghost" disabled={cancelling} onClick={onCancel} className="h-11 rounded-[3px] border border-line-strong px-6 text-sm font-semibold text-ink hover:bg-line sm:h-10">
          Cancel booking
        </Button>
      ) : (
        <BookButton onClick={onBook} loading={booking} disabled={!selection}>
          Book appointment
        </BookButton>
      )}
    </div>
  );
}
