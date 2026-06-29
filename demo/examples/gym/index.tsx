"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Stage } from "@/components/stage";
import { Segmented } from "@/components/ui/segmented";
import { formatTime } from "@/lib/time";
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
} from "@/components/ui/kibo-ui/calendar";
import { ensureGym, type GymData } from "./seed";
import {
  getPublicSchedule,
  getStaffSchedule,
  type PublicClass,
  type StaffClass,
} from "@/app/actions/gym";

type View = "public" | "staff";
type GymClass = PublicClass | StaffClass;

const OPEN = "#34d399";
const FILLING = "#fbbf24";
const FULL = "#f87171";

function colorFor(c: GymClass): string {
  if (c.full) return FULL;
  if (c.spotsLeft <= 3) return FILLING;
  return OPEN;
}

function isStaff(c: GymClass): c is StaffClass {
  return "instructor" in c;
}

const VIEW_ITEMS = [
  { value: "public" as const, label: "Public view" },
  { value: "staff" as const, label: "Staff view" },
];

const CAPTION: Record<View, string> = {
  public: "What anyone embedding this schedule sees: the class, its time, and how many spots are left.",
  staff: "Internal view — adds instructor, capacity, and class notes. Gate this behind auth in production.",
};

export default function GymExample({ publicOnly = false }: { publicOnly?: boolean }) {
  const [view, setView] = useState<View>("public");
  const [data, setData] = useState<GymData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    ensureGym()
      .then(setData)
      .catch(() => {
        setFailed(true);
        toast.error("Failed to connect to Δt. Is it running?");
      });
  }, []);

  // The embed widget is the published, public artifact: no toggle, pinned to the public view, so it
  // can never request or render staff fields. The full /demos/gym page keeps the toggle to show the
  // redaction boundary side by side.
  const ribbon = publicOnly ? (
    <p className="max-w-md text-center text-[11px] leading-relaxed text-zinc-500">{CAPTION.public}</p>
  ) : (
    <div className="flex flex-col items-center gap-2">
      <Segmented ariaLabel="Audience" items={VIEW_ITEMS} value={view} onChange={setView} />
      <p className="max-w-md text-center text-[11px] leading-relaxed text-zinc-500">{CAPTION[view]}</p>
    </div>
  );

  return (
    <Stage
      primitive={{ label: "Published schedule, redacted at the edge", specId: "EDGE-03" }}
      title="FitFlow Studio"
      ribbon={ribbon}
      contentMax="max-w-3xl"
    >
      <CalendarProvider startDay={1} className="w-full">
        <GymCalendar view={publicOnly ? "public" : view} data={data} failed={failed} />
      </CalendarProvider>
    </Stage>
  );
}

function GymCalendar({
  view,
  data,
  failed,
}: {
  view: View;
  data: GymData | null;
  failed: boolean;
}) {
  const [month, setMonth] = useCalendarMonth();
  const [year, setYear] = useCalendarYear();
  const ready = data !== null;

  const [classes, setClasses] = useState<GymClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

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
    if (data) {
      const s = new Date(data.window.start);
      const e = new Date(data.window.end - 1);
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
  }, [data]);

  // On load, snap the displayed month into the seeded range — today may sit outside it on a
  // long-lived deployment, and this also clears any stale month left in the shared calendar state.
  useEffect(() => {
    if (!data) return;
    const cur = new Date(year, month, 1).getTime();
    if (cur < nav.min.getTime()) {
      setYear(nav.min.getFullYear());
      setMonth(nav.min.getMonth() as CalendarState["month"]);
    } else if (cur > nav.max.getTime()) {
      setYear(nav.max.getFullYear());
      setMonth(nav.max.getMonth() as CalendarState["month"]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Selection + stale-data reset is keyed on the month only, NOT the view — flipping Public/Staff
  // keeps the day you were looking at, while navigating months clears last month's classes (so the
  // detail panel never shows them under a new month's heading) and re-defaults the selection.
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
    const fetcher = view === "staff" ? getStaffSchedule : getPublicSchedule;
    fetcher(windowStart, windowEnd)
      .then((rows) => !cancelled && setClasses(rows))
      .catch(() => !cancelled && toast.error("Failed to load schedule"))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [ready, view, windowStart, windowEnd]);

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

  if (failed) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center text-sm text-zinc-400">
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

      <div className="overflow-hidden rounded-xl border border-white/[0.06]">
        <CalendarHeader />
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0c]/50 text-xs text-zinc-400">
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
                  <span className="truncate text-zinc-300">{feature.name}</span>
                  {c && (
                    <span className="ml-auto shrink-0 text-[10px] text-zinc-500">
                      {c.full ? "full" : c.spotsLeft}
                    </span>
                  )}
                </div>
              );
            }}
          </CalendarBody>
        </div>
      </div>

      {selectedLabel && (
        <div className="mt-5">
          <div className="mb-3 text-sm font-medium text-zinc-200">{selectedLabel}</div>
          {selectedClasses.length === 0 ? (
            <div className="text-xs text-zinc-500">No classes scheduled.</div>
          ) : (
            <ul className="flex flex-col gap-2">
              {selectedClasses.map((c) => (
                <li
                  key={c.id}
                  className="flex items-start gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
                >
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(c) }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-zinc-200">{c.title}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {formatTime(c.start)} – {formatTime(c.end)}
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs">
                      {c.full ? (
                        <span className="text-red-300/80">Full</span>
                      ) : (
                        <span className={c.spotsLeft <= 3 ? "text-amber-300/90" : "text-emerald-300/90"}>
                          {c.spotsLeft} {c.spotsLeft === 1 ? "spot" : "spots"} left
                        </span>
                      )}
                      {isStaff(c) && (
                        <span className="text-zinc-500">
                          {" · "}
                          {c.instructor ?? "Unassigned"} · {c.booked}/{c.capacity} booked
                        </span>
                      )}
                    </div>
                    {isStaff(c) && c.notes && (
                      <div className="mt-1 text-[11px] leading-relaxed text-zinc-500">{c.notes}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
