"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource } from "@/lib/schemas";
import { formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getCombinedAvailability } from "@/app/actions/availability";
import { batchBookSlots } from "@/app/actions/bookings";

const DAY = 86_400_000;
const HORIZON_DAYS = 21; // three weeks ahead
const MIN_DINNER_MS = 2 * 60 * 60_000; // a dinner needs at least a 2h window all five share

interface Slot {
  start: number;
  end: number;
}

const dayLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });

// Five friends, five calendars: scan three weeks and surface only the evenings all five are free.
// One deltat query (combined availability, min_available = everyone) does the whole intersection.
export function DinnerFinder({ resourceIds, resources }: { resourceIds: string[]; resources: Resource[] }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const load = useCallback(async () => {
    if (resourceIds.length === 0) return;
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    const combined = await getCombinedAvailability(resourceIds, startMs, startMs + HORIZON_DAYS * DAY, resourceIds.length);
    setSlots(combined.filter((s) => s.end - s.start >= MIN_DINNER_MS).map((s) => ({ start: s.start, end: s.end })));
  }, [resourceIds]);

  useEffect(() => {
    load()
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
  }, [load]);

  function book(slot: Slot) {
    startTransition(async () => {
      try {
        const created = await batchBookSlots(resourceIds.map((id) => ({ resourceId: id, start: slot.start, end: slot.end, label: "Dinner" })));
        setResult({
          title: "Dinner booked",
          subtitle: `${dayLabel(slot.start)} · ${formatTime(slot.start)} to ${formatTime(slot.end)}`,
          bookings: created,
          resources,
        });
        await load();
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="text-center text-sm font-medium text-zinc-100">Dinner with five friends</div>
      <p className="mx-auto mt-1 max-w-md text-center text-[12px] leading-relaxed text-zinc-400">
        The only evenings all five are free in the next three weeks. One query intersects five
        calendars with <span className="text-emerald-300">min_available = 5</span>.
      </p>

      <div className="mt-5">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Checking five calendars…
          </div>
        ) : slots.length === 0 ? (
          <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-10 text-center text-sm text-zinc-500">
            No evening works for all five in the next three weeks.
          </div>
        ) : (
          <div className="space-y-2">
            {slots.map((s) => (
              <div
                key={s.start}
                className="flex items-center gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-4 py-2.5"
              >
                <UtensilsCrossed className="h-4 w-4 shrink-0 text-emerald-300/70" />
                <div className="flex-1">
                  <div className="text-sm font-medium text-zinc-100">{dayLabel(s.start)}</div>
                  <div className="text-[12px] text-zinc-400">
                    {formatTime(s.start)} to {formatTime(s.end)}
                  </div>
                </div>
                <Button
                  onClick={() => book(s)}
                  disabled={isPending}
                  className="h-9 px-4 text-sm font-semibold bg-emerald-500 text-white hover:bg-emerald-400"
                >
                  Book
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </div>
  );
}
