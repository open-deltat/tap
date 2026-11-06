"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Stage } from "../../components/stage";
import { formatTime } from "@open-deltat/shared/time";
import {
  CalendarBody,
  CalendarDate,
  CalendarDatePagination,
  CalendarHeader,
  CalendarLabel,
  CalendarProvider,
  useCalendarMonth,
  useCalendarYear,
  type CalendarState,
  type Feature,
} from "../../components/ui/kibo-ui/calendar";
import { getPublicSchedule, getScheduleWindow, bookGymClass, type PublicClass } from "./actions";

// CSS variables rather than hex so the dots follow the light/dark theme: free, nearly full, full.
const OPEN = "var(--dt-accent)";
const FILLING = "var(--dt-held)";
const FULL = "var(--dt-ink-3)";

function colorFor(c: PublicClass): string {
  if (c.full) return FULL;
  if (c.spotsLeft <= 3) return FILLING;
  return OPEN;
}

const CAPTION = "A schedule anyone can embed and book from. Capacity and the roster stay on the server; the widget shows only spots left.";

export default function GymExample() {
  const [range, setRange] = useState<{ start: number; end: number } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    getScheduleWindow()
      .then(setRange)
      .catch(() => {
        setFailed(true);
        toast.error("Failed to connect to Δt. Is it running?");
      });
  }, []);

  const ribbon = (
    <p className="mx-auto max-w-md text-pretty text-center text-[13px] leading-relaxed text-dt-ink-3">{CAPTION}</p>
  );

  return (
    <Stage
      primitive={{ label: "Weekly classes, embeddable and bookable", specId: "EDGE-03" }}
      title="FitFlow Studio"
      ribbon={ribbon}
      contentMax="max-w-3xl"
    >
      <CalendarProvider startDay={1} className="w-full">
        <GymCalendar range={range} failed={failed} />
      </CalendarProvider>
    </Stage>
  );
}

function GymCalendar({ range, failed }: { range: { start: number; end: number } | null; failed: boolean }) {
  const [month, setMonth] = useCalendarMonth();
  const [year, setYear] = useCalendarYear();
  const ready = range !== null;

  const [classes, setClasses] = useState<PublicClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [bookingId, setBookingId] = useState<string | null>(null);

  const { windowStart, windowEnd } = useMemo(
    () => ({
      windowStart: new Date(year, month, 1).getTime(),
      windowEnd: new Date(year, month + 1, 1).getTime(),
    }),
    [year, month]
  );

  // Clamp navigation to the months the seed actually covers, so the pager can never land on an empty
  // grid (the seeded window is fixed; "today" floats).
  const nav = useMemo(() => {
    if (range) {
      const s = new Date(range.start);
      const e = new Date(range.end - 1);
      return {
        min: new Date(s.getFullYear(), s.getMonth(), 1),
        max: new Date(e.getFullYear(), e.getMonth(), 1),
      };
    }
    const now = new Date();
    return {
      min: new Date(now.getFullYear(), now.getMonth(), 1),
      max: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }, [range]);

  // On load, snap the displayed month into the seeded range. Today may sit outside it on a
  // long-lived deployment, and this also clears any stale month left in the shared calendar state.
  useEffect(() => {
    if (!range) return;
    const cur = new Date(year, month, 1).getTime();
    if (cur < nav.min.getTime()) {
      setYear(nav.min.getFullYear());
      setMonth(nav.min.getMonth() as CalendarState["month"]);
    } else if (cur > nav.max.getTime()) {
      setYear(nav.max.getFullYear());
      setMonth(nav.max.getMonth() as CalendarState["month"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Navigating months clears last month's classes (so the detail panel never shows them under a new
  // month's heading) and re-defaults the selection to today when it's in view.
  useEffect(() => {
    setClasses([]);
    const today = new Date();
    const onThisMonth = today.getFullYear() === year && today.getMonth() === month;
    setSelectedDay(onThisMonth ? today.getDate() : null);
  }, [year, month]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    getPublicSchedule(windowStart, windowEnd)
      .then((rows) => !cancelled && setClasses(rows))
      .catch(() => !cancelled && toast.error("Failed to load schedule"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, windowStart, windowEnd]);

  const features: Feature[] = useMemo(
    () =>
      classes.map((c) => ({
        id: c.id,
        name: `${formatTime(c.start)} · ${c.title}`,
        startAt: new Date(c.start),
        endAt: new Date(c.end),
        status: { id: c.id, name: c.title, color: colorFor(c) },
      })),
    [classes]
  );

  const byId = useMemo(() => new Map(classes.map((c) => [c.id, c])), [classes]);

  const selectedClasses = useMemo(() => {
    if (selectedDay === null) return [];
    return classes
      .filter((c) => new Date(c.start).getDate() === selectedDay)
      .sort((a, b) => a.start - b.start);
  }, [classes, selectedDay]);

  const selectedLabel =
    selectedDay !== null
      ? new Date(year, month, selectedDay).toLocaleDateString(undefined, {
          weekday: "long",
          month: "long",
          day: "numeric",
        })
      : null;

  async function refresh() {
    setClasses(await getPublicSchedule(windowStart, windowEnd));
  }

  async function book(ruleId: string) {
    setBookingId(ruleId);
    try {
      await bookGymClass(ruleId);
      toast.success("Booked. See you in class.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not book.");
    } finally {
      // Refresh either way: on success spots drop, on a "just filled up" error the count corrects.
      await refresh();
      setBookingId(null);
    }
  }

  if (failed) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center text-sm text-dt-ink-3">
        Couldn&apos;t reach the schedule.
      </div>
    );
  }

  return (
    <div className="relative">
      <CalendarDate>
        <CalendarLabel />
        <CalendarDatePagination min={nav.min} max={nav.max} />
      </CalendarDate>

      <div className="overflow-hidden rounded-2xl border border-dt-line bg-dt-surface">
        <CalendarHeader />
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-dt-surface/60 text-xs text-dt-ink-3 backdrop-blur-[2px]">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading…
            </div>
          )}
          <CalendarBody
            features={features}
            max={3}
            onSelectDay={(date) => setSelectedDay(date.getDate())}
          >
            {({ feature }) => {
              const c = byId.get(feature.id);
              return (
                <div key={feature.id} className="flex items-center gap-1.5 text-[11px]">
                  <span
                    className="h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: feature.status.color }}
                  />
                  <span className="truncate tabular-nums text-dt-ink-2">{feature.name}</span>
                  {c && (
                    <span className="ml-auto shrink-0 text-[10px] tabular-nums text-dt-ink-3">
                      {c.full ? "full" : c.spotsLeft}
                    </span>
                  )}
                </div>
              );
            }}
          </CalendarBody>
        </div>
      </div>

      {/* Reserved so day-select and month navigation swap content in place instead of growing. */}
      <div className="mt-5 min-h-[16rem]">
        {selectedLabel ? (
          <>
            <div className="mb-3 text-[15px] font-semibold tracking-tight text-dt-ink">{selectedLabel}</div>
            {selectedClasses.length === 0 ? (
              <div className="text-sm text-dt-ink-3">No classes scheduled.</div>
            ) : (
              <ul className="flex max-h-[16rem] flex-col gap-2 overflow-y-auto">
                {selectedClasses.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-2xl border border-dt-line bg-dt-sunken px-4 py-3"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(c) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium text-dt-ink">{c.title}</span>
                      <span className="shrink-0 text-xs tabular-nums text-dt-ink-3">
                        {formatTime(c.start)} – {formatTime(c.end)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs tabular-nums">
                      {c.full ? (
                        <span className="text-dt-ink-3">Full</span>
                      ) : (
                        <span className={c.spotsLeft <= 3 ? "text-dt-held-ink" : "text-dt-accent-ink"}>
                          {c.spotsLeft} {c.spotsLeft === 1 ? "spot" : "spots"} left
                        </span>
                      )}
                    </div>
                  </div>
                  {!c.full && (
                    <button
                      type="button"
                      onClick={() => book(c.id)}
                      disabled={bookingId !== null}
                      className="inline-flex h-10 min-w-[4.5rem] shrink-0 items-center justify-center gap-1 self-center rounded-full bg-dt-ink px-4 text-[13px] font-semibold text-dt-on-ink transition-[transform,background-color,opacity] duration-150 hover:bg-dt-ink/85 active:scale-[0.97] disabled:opacity-50 sm:h-9"
                    >
                      {bookingId === c.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Book"}
                    </button>
                  )}
                </li>
              ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex min-h-[16rem] items-center justify-center text-sm text-dt-ink-3">
            Pick a day to see classes
          </div>
        )}
      </div>
    </div>
  );
}
