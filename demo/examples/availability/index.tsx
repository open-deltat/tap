"use client";

import { useEffect, useState, useCallback, useTransition, useMemo } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { formatTime, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import type { AvailabilitySlot, Resource } from "@/lib/schemas";

import { seedAvailabilityScheduler } from "./seed";
import { getAvailability } from "@/app/actions/availability";
import { bookSlot } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";

const SLOT_MS = 30 * 60_000;
const NAME = "Dr. Sarah Chen";
const WINDOW_DAYS = 21;

function asResource(id: string): Resource {
  return {
    id,
    parentId: null,
    name: NAME,
    capacity: 1,
    bufferAfter: null,
    slotMinutes: 30,
    price: null,
    bufferMinutes: 0,
  };
}

export default function AvailabilityExample() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [date, setDate] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [selected, setSelected] = useState<{ start: number; end: number } | null>(null);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const { windowStart, windowEnd } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + WINDOW_DAYS - 1);
    return { windowStart: start, windowEnd: end };
  }, []);

  const loadSlots = useCallback(async (id: string, d: Date) => {
    const { dayStart, dayEnd } = dayBounds(d);
    setSlotsLoading(true);
    try {
      const raw = await getAvailability(id, dayStart, dayEnd);
      const expanded: AvailabilitySlot[] = [];
      for (const s of raw) {
        let cursor = s.start;
        while (cursor + SLOT_MS <= s.end) {
          expanded.push({ start: cursor, end: cursor + SLOT_MS });
          cursor += SLOT_MS;
        }
      }
      setSlots(expanded);
      // Default-select the first slot so the day never reads as empty.
      setSelected((prev) => {
        if (prev && expanded.some((s) => s.start === prev.start)) return prev;
        return expanded.length > 0 ? { start: expanded[0].start, end: expanded[0].end } : null;
      });
    } catch {
      setSlots([]);
      setSelected(null);
    } finally {
      setSlotsLoading(false);
    }
  }, []);

  useEffect(() => {
    seedAvailabilityScheduler()
      .then(async (id) => {
        setResourceId(id);
        await loadSlots(id, date);
      })
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resourceId) loadSlots(resourceId, date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, resourceId]);

  const onWsEvent = useCallback(() => {
    if (resourceId) loadSlots(resourceId, date);
  }, [resourceId, date, loadSlots]);
  useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: onWsEvent } : null);

  function confirm() {
    if (!selected || !resourceId) return;
    const d = date;
    const rid = resourceId;
    startTransition(async () => {
      try {
        const booking = await bookSlot({
          resourceId: rid,
          start: selected.start,
          end: selected.end,
          label: name.trim() || "Appointment",
        });
        setResult({
          title: `Appointment · ${NAME}`,
          subtitle: `${formatTime(selected.start)} – ${formatTime(selected.end)}`,
          bookings: [booking],
          resources: [asResource(rid)],
        });
        setName("");
        await loadSlots(rid, d);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
        await loadSlots(rid, d);
      }
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat…
        </div>
      </div>
    );
  }

  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="relative h-full overflow-auto bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative flex min-h-full flex-col items-center px-4 py-10">
        <div className="mb-4 text-center">
          <div className="flex items-center justify-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
            <span>Availability − rules − bookings</span>
            <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal text-zinc-500">
              AVAIL-01
            </span>
          </div>
        </div>

        <div className="w-full max-w-3xl overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.025] shadow-2xl shadow-black/50">
          <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr]">
            {/* Left — practitioner header + date picker */}
            <div className="border-b border-white/[0.06] p-5 sm:border-b-0 sm:border-r">
              <div className="mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-emerald-500/15 text-xs font-semibold text-emerald-300">
                    SC
                  </span>
                  <div>
                    <div className="text-sm font-semibold text-zinc-100">{NAME}</div>
                    <div className="text-xs text-zinc-500">30-min sessions</div>
                  </div>
                </div>
              </div>

              <div className="[color-scheme:dark]">
                <Calendar
                  mode="single"
                  required
                  selected={date}
                  onSelect={(d) => {
                    if (!d) return;
                    const next = new Date(d);
                    next.setHours(0, 0, 0, 0);
                    setDate(next);
                  }}
                  defaultMonth={date}
                  startMonth={windowStart}
                  disabled={{ before: windowStart, after: windowEnd }}
                  className="text-zinc-100"
                />
              </div>
            </div>

            {/* Right — that day's 30-min slots */}
            <div className="flex min-h-[26rem] flex-col p-5">
              <div className="mb-3 flex items-baseline justify-between">
                <div className="text-sm font-medium text-zinc-200">{dateLabel}</div>
                <div className="text-[11px] text-zinc-500">
                  {slots.length > 0 ? `${slots.length} open` : "—"}
                </div>
              </div>

              <div className="relative flex-1">
                {slotsLoading ? (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                    Loading…
                  </div>
                ) : slots.length === 0 ? (
                  <div className="flex h-full items-center justify-center px-2 text-center text-xs text-zinc-500">
                    No availability — Dr. Chen works weekdays, and two days are blocked out.
                  </div>
                ) : (
                  <div className="grid max-h-[22rem] grid-cols-2 gap-2 overflow-y-auto pr-1">
                    {slots.map((s) => {
                      const active = selected?.start === s.start;
                      return (
                        <button
                          key={s.start}
                          onClick={() => setSelected({ start: s.start, end: s.end })}
                          className={cn(
                            "rounded-md border px-3 py-2 text-sm font-medium transition-colors",
                            active
                              ? "border-emerald-400/50 bg-emerald-400/15 text-emerald-200"
                              : "border-white/10 text-zinc-300 hover:border-emerald-400/30 hover:bg-white/[0.04]"
                          )}
                        >
                          {formatTime(s.start)}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {selected && (
                <div className="mt-4 space-y-2 border-t border-white/[0.06] pt-4">
                  <div className="text-xs text-zinc-400">
                    {formatTime(selected.start)} – {formatTime(selected.end)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Your name (optional)"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="h-9 flex-1 border-white/10 bg-white/5 text-sm text-zinc-100 placeholder:text-zinc-500 [color-scheme:dark]"
                    />
                    <Button
                      onClick={confirm}
                      disabled={isPending}
                      className="h-9 bg-emerald-500 text-white hover:bg-emerald-400"
                    >
                      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Book"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />
    </div>
  );
}
