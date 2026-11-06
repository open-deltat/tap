"use client";

import { useMemo } from "react";
import { cn } from "@open-deltat/shared/utils";
import type { Booking } from "../../lib/schemas";
import { occupancyByNight, stableOpenings } from "./occupancy";

const DAY = 86_400_000;
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * A compact 30-night availability timeline for one room type: each night a bar (emerald = free,
 * amber = partly booked, rose = full), and below it the open WINDOWS: "available X → Y · Nn",
 * the inverse of occupancy. Pass `onPick` to make the windows clickable (booking side); leave it
 * out for a read-only manager view. `minNights` filters/labels to stays of at least that length.
 */
export function AvailabilityStrip({
  capacity,
  bookings,
  fromMs,
  days = 30,
  minNights = 1,
  onPick,
}: {
  capacity: number;
  bookings: Booking[];
  fromMs: number;
  days?: number;
  minNights?: number;
  onPick?: (start: number, nights: number) => void;
}) {
  const occ = useMemo(() => occupancyByNight(bookings), [bookings]);

  const nights = useMemo(() => {
    const cursor = new Date(fromMs);
    cursor.setHours(0, 0, 0, 0);
    const arr: { t: number; taken: number }[] = [];
    for (let i = 0; i < days; i++) {
      arr.push({ t: cursor.getTime(), taken: occ.get(cursor.getTime())?.taken ?? 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    return arr;
  }, [occ, fromMs, days]);

  const openings = useMemo(
    () => stableOpenings(bookings, capacity, minNights, fromMs, days),
    [bookings, capacity, minNights, fromMs, days]
  );

  return (
    <div>
      {/* One column per night; each column is a stack of `capacity` pips (one per room), booked
          rooms (rose) fill from the bottom, open rooms (emerald) on top. So you SEE "3 of 5 taken"
          without needing the word "partial". */}
      <div className="flex h-8 items-stretch gap-px">
        {nights.map(({ t, taken }) => (
          <div
            key={t}
            className="flex flex-1 flex-col-reverse gap-px"
            title={`${fmt(t)} · ${Math.max(0, capacity - taken)} of ${capacity} free`}
          >
            {Array.from({ length: capacity }).map((_, i) => (
              <div
                key={i}
                className={cn("flex-1 rounded-[2px]", i < taken ? "bg-dt-ink-3/35" : "bg-dt-accent")}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="mt-2 flex min-h-[2.75rem] flex-wrap gap-1">
        {openings.length === 0 ? (
          <span className="text-[12px] text-dt-ink-3">
            no {minNights > 1 ? `${minNights}-night ` : ""}opening in {days} days
          </span>
        ) : (
          openings.map((o) => {
            const label = `${fmt(o.start)} to ${fmt(o.start + o.nights * DAY)} · ${o.nights}n`;
            if (!onPick) {
              return (
                <span
                  key={o.start}
                  className="rounded-full border border-dt-line px-2.5 py-1 text-[11px] tabular-nums text-dt-ink-2"
                >
                  {label}
                </span>
              );
            }
            return (
              <button
                key={o.start}
                type="button"
                onClick={() => onPick(o.start, minNights > 1 ? minNights : o.nights)}
                title={`Book ${minNights > 1 ? minNights : o.nights} night${(minNights > 1 ? minNights : o.nights) > 1 ? "s" : ""} from ${fmt(o.start)}`}
                className="relative rounded-full border border-dt-line-strong bg-dt-surface px-2.5 py-1 text-[11px] tabular-nums text-dt-ink transition-[background-color,border-color,transform] duration-150 after:absolute after:-inset-1.5 hover:border-dt-ink active:scale-[0.97]"
              >
                {label}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
