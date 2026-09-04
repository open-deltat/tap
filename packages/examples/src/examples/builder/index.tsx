"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Stage } from "../../components/stage";
import { WeekHoursEditor } from "../../components/week-hours-editor";
import { cn } from "@open-deltat/shared/utils";
import { LabeledTimeline, type TimelineRow, type TimelineBox } from "../../components/labeled-timeline";
import { BookingConfirmedModal, type BookingResult } from "../../components/booking-confirmed-modal";
import type { Resource, Booking, AvailabilitySlot } from "../../lib/schemas";
import { formatTime } from "@open-deltat/shared/time";
import { formatError } from "../../lib/format-error";

import {
  DEFAULT_WEEK,
  DOW_LABEL,
  weekToRanges,
  rulesToWeek,
  builderDateRange,
  shortHour,
  type WeekHours,
} from "./schedule";
import { ensureBuilderCalendar } from "./seed";
import { setWeeklyAvailability, getRulesForResource } from "../../actions/rules";
import { getResources } from "../../actions/resources";
import { getAvailability } from "../../actions/availability";
import { getMultiResourceBookings, batchBookSlots } from "../../actions/bookings";
import { useWebSocket } from "../../hooks/use-websocket";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const STRIP_DAYS = 7;

interface DayResult {
  dow: number;
  dayMidnight: number;
  free: AvailabilitySlot[];
  booked: Booking[];
}


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
  // whole hours, plus an hour ruler, so the strip zooms to the data instead of always showing 0-24h.
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
            <WeekHoursEditor week={week} onChange={setWeek} />
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

