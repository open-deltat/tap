"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Booking } from "@/lib/schemas";
import { occupancyByNight, stableOpenings } from "./occupancy";

const DAY = 86_400_000;
const fmt = (ms: number) => new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/**
 * A compact 30-night availability timeline for one room type: each night a bar (emerald = free,
 * amber = partly booked, rose = full), and below it the open WINDOWS — "available X → Y · Nn" —
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
      <div className="flex h-5 gap-px overflow-hidden rounded-sm">
        {nights.map(({ t, taken }) => {
          const cls =
            taken === 0
              ? "bg-emerald-500/70"
              : taken >= capacity
                ? "bg-rose-500/45"
                : "bg-amber-500/45";
          return (
            <div
              key={t}
              className={cn("flex-1", cls)}
              title={`${fmt(t)} · ${Math.max(0, capacity - taken)}/${capacity} free`}
            />
          );
        })}
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        {openings.length === 0 ? (
          <span className="text-[11px] text-zinc-600">
            no {minNights > 1 ? `${minNights}-night ` : ""}opening in {days} days
          </span>
        ) : (
          openings.map((o) => {
            const label = `${fmt(o.start)} – ${fmt(o.start + o.nights * DAY)} · ${o.nights}n`;
            if (!onPick) {
              return (
                <span
                  key={o.start}
                  className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400"
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
                className="rounded border border-emerald-400/30 bg-emerald-400/10 px-1.5 py-0.5 font-mono text-[10px] text-emerald-200 transition-colors hover:bg-emerald-400/20"
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
