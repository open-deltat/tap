"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import { Stage } from "@/components/stage";
import { cn } from "@/lib/utils";
import { LabeledTimeline, type TimelineRow, type TimelineBox } from "@/components/labeled-timeline";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource, Booking, AvailabilitySlot } from "@/lib/schemas";
import { formatTime } from "@/lib/time";
import { formatError } from "@/lib/format-error";

import {
  DEFAULT_WEEK,
  DOW_ORDER,
  DOW_LABEL,
  TIME_OPTIONS,
  weekToRanges,
  rulesToWeek,
  builderDateRange,
  shortHour,
  type WeekHours,
} from "./schedule";
import { ensureBuilderCalendar } from "./seed";
import { setWeeklyAvailability, getRulesForResource } from "@/app/actions/rules";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, batchBookSlots } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const STRIP_DAYS = 7;

interface DayResult {
  dow: number;
  dayMidnight: number;
  free: AvailabilitySlot[];
  booked: Booking[];
}

const DEFAULT_RANGE = { start: "09:00", end: "17:00" };

export default function BuilderExample() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [resources, setResources] = useState<Resource[]>([]);
  const [week, setWeek] = useState<WeekHours>(DEFAULT_WEEK);
  const [strip, setStrip] = useState<DayResult[]>([]);
  const [ruleCount, setRuleCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, startSaving] = useTransition();
  const [result, setResult] = useState<BookingResult | null>(null);

  const loadStrip = useCallback(async (id: string) => {
    // True local midnights per day (not fixed 24h steps) so the strip stays correct across a DST
    // change, since the rules themselves are built from local wall-clock times.
    const midnightAt = (i: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() + i);
      return d.getTime();
    };
    const ds = midnightAt(0);
    const de = midnightAt(STRIP_DAYS);

    const [free, bookMap, rules] = await Promise.all([
      getAvailability(id, ds, de),
      getMultiResourceBookings([id]),
      getRulesForResource(id),
    ]);
    const booked = ((bookMap[id] ?? []) as Booking[]).filter((b) => b.start < de && b.end > ds);

    const days: DayResult[] = [];
    for (let i = 0; i < STRIP_DAYS; i++) {
      const dayMidnight = midnightAt(i);
      const dayEnd = midnightAt(i + 1);
      days.push({
        dow: new Date(dayMidnight).getDay(),
        dayMidnight,
        free: free.filter((s) => s.start < dayEnd && s.end > dayMidnight),
        booked: booked.filter((b) => b.start < dayEnd && b.end > dayMidnight),
      });
    }
    setStrip(days);
    setRuleCount(rules.filter((r) => !r.blocking).length);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const id = await ensureBuilderCalendar();
        setResourceId(id);
        setResources(await getResources());
        // Load the saved schedule into the editor so it mirrors what deltat actually stores.
        const rules = await getRulesForResource(id);
        setWeek(rulesToWeek(rules));
        await loadStrip(id);
      } catch {
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
  }, [loadStrip]);

  useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: () => resourceId && loadStrip(resourceId) } : null);

  // ── editor mutations ──
  const setRanges = (dow: number, ranges: { start: string; end: string }[]) =>
    setWeek((w) => ({ ...w, [dow]: ranges }));
  const toggleDay = (dow: number) =>
    setWeek((w) => ({ ...w, [dow]: (w[dow]?.length ?? 0) > 0 ? [] : [{ ...DEFAULT_RANGE }] }));
  const addRange = (dow: number) => setRanges(dow, [...(week[dow] ?? []), { ...DEFAULT_RANGE }]);
  const removeRange = (dow: number, idx: number) =>
    setRanges(dow, (week[dow] ?? []).filter((_, i) => i !== idx));
  const editRange = (dow: number, idx: number, field: "start" | "end", value: string) =>
    setRanges(dow, (week[dow] ?? []).map((r, i) => (i === idx ? { ...r, [field]: value } : r)));

  function save() {
    if (!resourceId) return;
    startSaving(async () => {
      try {
        const { fromDate, toDate } = builderDateRange();
        const n = await setWeeklyAvailability({ resourceId, ranges: weekToRanges(week), fromDate, toDate });
        toast.success(`Saved ${n} rules for the next 4 weeks`);
        await loadStrip(resourceId);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function bookFirstOpenHour() {
    if (!resourceId) return;
    const day = strip.find((d) => d.free.length > 0);
    if (!day) {
      toast.error("No open time to book. Set some hours and save first.");
      return;
    }
    const slot = day.free[0];
    const start = slot.start;
    const end = Math.min(start + HOUR_MS, slot.end);
    startSaving(async () => {
      try {
        const created = await batchBookSlots([{ resourceId, start, end, label: "Bob" }]);
        setResult({
          title: "Booked",
          subtitle: `${formatTime(start)} to ${formatTime(end)}`,
          bookings: created,
          resources: resources.filter((r) => r.id === resourceId),
        });
        await loadStrip(resourceId);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  const stripRows: TimelineRow[] = strip.map((d) => {
    const boxes: TimelineBox[] = [
      ...d.free.map(
        (s): TimelineBox => ({
          start: s.start - d.dayMidnight,
          end: s.end - d.dayMidnight,
          color: "emerald",
          text: "Availability",
        })
      ),
      ...d.booked.map(
        (b): TimelineBox => ({
          start: b.start - d.dayMidnight,
          end: b.end - d.dayMidnight,
          color: "rose",
          text: b.label ?? "Booked",
        })
      ),
    ];
    return { label: DOW_LABEL[d.dow], boxes };
  });

  // Auto-fit the axis to the hours actually used this week (first availability to last), padded to
  // whole hours, plus an hour ruler — so the strip zooms to the data instead of always showing 0-24h.
  const HOUR = 3_600_000;
  const allBoxes = stripRows.flatMap((r) => r.boxes);
  const lo = allBoxes.length ? Math.floor(Math.min(...allBoxes.map((b) => b.start)) / HOUR) * HOUR : 8 * HOUR;
  const hi = allBoxes.length ? Math.ceil(Math.max(...allBoxes.map((b) => b.end)) / HOUR) * HOUR : 18 * HOUR;
  const tickStep = Math.max(HOUR, Math.ceil((hi - lo) / 6 / HOUR) * HOUR);
  const ticks: { value: number; label: string }[] = [];
  for (let t = lo; t <= hi; t += tickStep) ticks.push({ value: t, label: shortHour(t) });

  const tray = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-100">Weekly availability</div>
        <div className="text-xs text-zinc-400">
          {ruleCount != null ? `${ruleCount} time blocks in Δt` : "…"} · for the next 4 weeks
        </div>
      </div>
      <Button
        variant="outline"
        onClick={bookFirstOpenHour}
        disabled={saving}
        className="h-10 border-white/15 px-4 text-sm text-zinc-200 hover:bg-white/5"
      >
        Book first open hour
      </Button>
      <Button
        onClick={save}
        disabled={saving}
        className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
      >
        {saving ? "Saving…" : "Save schedule"}
      </Button>
    </div>
  );

  return (
    <>
      <Stage
        primitive={{ label: "Set weekly hours, get real time", specId: "EDGE-03" }}
        title="Build a weekly schedule"
        tray={tray}
      >
        <div className="grid gap-7 lg:grid-cols-2">
          <div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">Weekly hours</div>
            <div className="space-y-1.5">
              {DOW_ORDER.map((dow) => {
                const ranges = week[dow] ?? [];
                const on = ranges.length > 0;
                return (
                  <div key={dow} className="flex items-start gap-3 rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
                    <div className="flex w-14 shrink-0 flex-col items-start gap-1.5">
                      <span className="text-[12px] font-medium text-zinc-200">{DOW_LABEL[dow]}</span>
                      <Toggle
                        size="sm"
                        pressed={on}
                        onPressedChange={() => toggleDay(dow)}
                        aria-label={`${on ? "Disable" : "Enable"} ${DOW_LABEL[dow]}`}
                      >
                        {on ? "Open" : "Off"}
                      </Toggle>
                    </div>
                    {on ? (
                      <div className="flex flex-1 flex-col gap-1.5">
                        {ranges.map((r, idx) => (
                          <div key={idx} className="flex items-center gap-1.5">
                            <TimeSelect value={r.start} onChange={(v) => editRange(dow, idx, "start", v)} />
                            <span className="text-zinc-500">to</span>
                            <TimeSelect value={r.end} onChange={(v) => editRange(dow, idx, "end", v)} />
                            <button
                              type="button"
                              onClick={() => removeRange(dow, idx)}
                              className="ml-0.5 rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                              aria-label="Remove range"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addRange(dow)}
                          className="flex w-fit items-center gap-1 rounded px-1 py-0.5 text-[11px] text-emerald-300/80 hover:text-emerald-200"
                        >
                          <Plus className="h-3 w-3" /> Add a range
                        </button>
                      </div>
                    ) : (
                      <div className="flex-1 self-center text-[12px] text-zinc-600">Closed</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-zinc-500">What Δt stores</div>
            <LabeledTimeline axisStart={lo} axisEnd={hi} labelWidth={40} rows={stripRows} ticks={ticks} />
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
              Your weekly hours turn into real blocks of time, one per day. Nothing stores &quot;every
              Monday&quot;, just the actual days. Edit and save to watch it redraw. Red is already booked.
            </p>
          </div>
        </div>
      </Stage>

      <BookingConfirmedModal result={result} onClose={() => setResult(null)} onBookAnother={() => setResult(null)} />
    </>
  );
}

function TimeSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-[12px] text-zinc-200 outline-none focus:border-emerald-400/40"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t} className="bg-zinc-900">
          {t}
        </option>
      ))}
    </select>
  );
}
