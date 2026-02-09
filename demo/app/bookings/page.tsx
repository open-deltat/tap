"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Calendar, List, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, weekStart, weekDays } from "@/lib/utils";
import { CancelBookingDialog } from "@/components/booking-dialog";
import type { Resource, Booking } from "@/lib/schemas";

import { seed } from "@/app/actions/seed";
import { getResources } from "@/app/actions/resources";
import { getAllBookings, cancelBooking } from "@/app/actions/bookings";

// ── Color palette for venues ─────────────────────────────────

const VENUE_COLORS = [
  { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-800", dot: "bg-blue-500" },
  { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-800", dot: "bg-purple-500" },
  { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-800", dot: "bg-amber-500" },
  { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-800", dot: "bg-emerald-500" },
  { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-800", dot: "bg-rose-500" },
  { bg: "bg-cyan-100", border: "border-cyan-300", text: "text-cyan-800", dot: "bg-cyan-500" },
];

function hashStr(s: string): number {
  let h = 0;
  for (const ch of s) h = ((h << 5) - h + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

function venueColor(venueId: string) {
  return VENUE_COLORS[hashStr(venueId) % VENUE_COLORS.length];
}

// ── Enriched booking with resource context ───────────────────

interface EnrichedBooking extends Booking {
  seatName: string;
  sectionName: string;
  sectionPrice: number | null;
  venueName: string;
  venueId: string;
}

function enrichBooking(b: Booking, resources: Resource[]): EnrichedBooking {
  const seat = resources.find((r) => r.id === b.resourceId);
  if (!seat)
    return { ...b, seatName: "?", sectionName: "", sectionPrice: null, venueName: "Unknown", venueId: "" };

  const parent = seat.parentId ? resources.find((r) => r.id === seat.parentId) : null;
  if (!parent)
    return { ...b, seatName: seat.name, sectionName: "", sectionPrice: null, venueName: seat.name, venueId: seat.id };

  const grandparent = parent.parentId ? resources.find((r) => r.id === parent.parentId) : null;
  if (grandparent) {
    // 3-level: seat → section → venue
    return {
      ...b,
      seatName: seat.name,
      sectionName: parent.name,
      sectionPrice: parent.price,
      venueName: grandparent.name,
      venueId: grandparent.id,
    };
  }
  // 2-level: seat → venue
  return {
    ...b,
    seatName: seat.name,
    sectionName: "",
    sectionPrice: parent.price,
    venueName: parent.name,
    venueId: parent.id,
  };
}

// ── Formatting helpers ───────────────────────────────────────

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

function formatDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

// ── Calendar constants ───────────────────────────────────────

const START_HOUR = 5;
const END_HOUR = 24;
const HOUR_HEIGHT = 48; // px

// ── Page component ───────────────────────────────────────────

export default function BookingsPage() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [viewMode, setViewMode] = useState<"list" | "calendar">("list");
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<EnrichedBooking | null>(null);

  const now = Date.now();

  useEffect(() => {
    async function init() {
      try {
        await seed();
        const [res, bk] = await Promise.all([getResources(), getAllBookings()]);
        setResources(res);
        setBookings(bk);
      } catch (err) {
        console.error(err);
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const enriched = bookings.map((b) => enrichBooking(b, resources));
  const upcoming = enriched.filter((b) => b.end > now).sort((a, b) => a.start - b.start);
  const past = enriched.filter((b) => b.end <= now).sort((a, b) => b.start - a.start);

  async function handleCancel() {
    if (!cancelTarget) return;
    setCancelDialogOpen(false);
    startTransition(async () => {
      try {
        await cancelBooking(cancelTarget.id);
        setBookings((prev) => prev.filter((b) => b.id !== cancelTarget.id));
        toast.success("Booking cancelled");
      } catch (err: any) {
        toast.error(err.message ?? "Failed to cancel");
      }
    });
  }

  const days = weekDays(weekOf);

  function prevWeek() {
    const d = new Date(weekOf);
    d.setDate(d.getDate() - 7);
    setWeekOf(d);
  }

  function nextWeek() {
    const d = new Date(weekOf);
    d.setDate(d.getDate() + 7);
    setWeekOf(d);
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat...
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <h1 className="text-sm font-semibold">My Bookings</h1>
        <div className="flex items-center gap-1">
          <Button
            variant={viewMode === "list" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("list")}
          >
            <List className="h-3.5 w-3.5 mr-1" />
            List
          </Button>
          <Button
            variant={viewMode === "calendar" ? "default" : "outline"}
            size="sm"
            onClick={() => setViewMode("calendar")}
          >
            <Calendar className="h-3.5 w-3.5 mr-1" />
            Calendar
          </Button>
        </div>
      </div>

      {viewMode === "list" ? (
        /* ── List view ─────────────────────────────────────── */
        <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
          {/* Stats */}
          <div className="flex gap-8 mb-6">
            <div>
              <div className="text-2xl font-semibold">{bookings.length}</div>
              <div className="text-xs text-muted-foreground">total</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-emerald-600">{upcoming.length}</div>
              <div className="text-xs text-muted-foreground">upcoming</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-muted-foreground">{past.length}</div>
              <div className="text-xs text-muted-foreground">past</div>
            </div>
          </div>

          {/* Upcoming */}
          {upcoming.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Upcoming
              </h2>
              <div className="space-y-2">
                {upcoming.map((b) => {
                  const color = venueColor(b.venueId);
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
                    >
                      <div className={cn("w-1 h-12 rounded-full shrink-0", color.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">{b.venueName}</span>
                          {b.label && (
                            <span className="text-xs text-muted-foreground">· {b.label}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(b.start)} · {formatTime(b.start)} – {formatTime(b.end)} ·{" "}
                          {formatDuration(b.end - b.start)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Seat {b.seatName}
                          {b.sectionName && ` · ${b.sectionName}`}
                          {b.sectionPrice !== null && ` · $${b.sectionPrice}`}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-destructive hover:text-destructive"
                        onClick={() => {
                          setCancelTarget(b);
                          setCancelDialogOpen(true);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Past */}
          {past.length > 0 && (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                Past
              </h2>
              <div className="space-y-2">
                {past.map((b) => {
                  const color = venueColor(b.venueId);
                  return (
                    <div
                      key={b.id}
                      className="flex items-center gap-3 rounded-lg border border-muted p-3 opacity-50"
                    >
                      <div className={cn("w-1 h-12 rounded-full shrink-0", color.dot)} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{b.venueName}</span>
                          {b.label && (
                            <span className="text-xs text-muted-foreground">· {b.label}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(b.start)} · {formatTime(b.start)} – {formatTime(b.end)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Seat {b.seatName}
                          {b.sectionName && ` · ${b.sectionName}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {bookings.length === 0 && (
            <div className="flex h-64 items-center justify-center">
              <div className="text-center space-y-2">
                <div className="text-sm text-muted-foreground">No bookings yet</div>
                <div className="text-xs text-muted-foreground/70">
                  Book seats from the{" "}
                  <a href="/demos/airline" className="underline">
                    Airline
                  </a>{" "}
                  demo or{" "}
                  <a href="/demos/scheduling" className="underline">
                    Scheduling
                  </a>{" "}
                  page
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ── Calendar view ─────────────────────────────────── */
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Week navigation */}
          <div className="flex items-center gap-3 border-b px-6 py-2">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevWeek}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium w-56 text-center">
              {days[0].toLocaleDateString(undefined, { month: "long", day: "numeric" })} –{" "}
              {days[6].toLocaleDateString(undefined, {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextWeek}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => setWeekOf(weekStart(new Date()))}
            >
              Today
            </Button>
            {enriched.length > 0 && (
              <div className="ml-auto flex items-center gap-3">
                {/* Venue legend */}
                {[...new Set(enriched.map((b) => b.venueId))].map((vid) => {
                  const color = venueColor(vid);
                  const name = enriched.find((b) => b.venueId === vid)?.venueName ?? "";
                  return (
                    <div key={vid} className="flex items-center gap-1">
                      <div className={cn("w-2.5 h-2.5 rounded-sm", color.dot)} />
                      <span className="text-[10px] text-muted-foreground">{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Day headers */}
          <div className="flex border-b shrink-0">
            <div className="w-14 shrink-0" />
            {days.map((day, i) => {
              const isToday = day.toDateString() === new Date().toDateString();
              return (
                <div
                  key={i}
                  className={cn(
                    "flex-1 text-center py-2 border-l text-xs",
                    isToday && "bg-emerald-50"
                  )}
                >
                  <div className="font-medium">
                    {day.toLocaleDateString(undefined, { weekday: "short" })}
                  </div>
                  <div
                    className={cn(
                      "text-muted-foreground",
                      isToday && "text-emerald-600 font-semibold"
                    )}
                  >
                    {day.getDate()}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Time grid */}
          <div className="flex-1 overflow-auto">
            <div
              className="flex relative"
              style={{ height: `${(END_HOUR - START_HOUR) * HOUR_HEIGHT}px` }}
            >
              {/* Time labels */}
              <div className="w-14 shrink-0 relative">
                {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
                  const hour = START_HOUR + i;
                  const label = hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`;
                  return (
                    <div
                      key={i}
                      className="absolute right-2 text-[10px] text-muted-foreground -translate-y-1/2"
                      style={{ top: `${i * HOUR_HEIGHT}px` }}
                    >
                      {label}
                    </div>
                  );
                })}
              </div>

              {/* Day columns */}
              {days.map((day, di) => {
                const dayStart = new Date(day);
                dayStart.setHours(0, 0, 0, 0);
                const dayStartMs = dayStart.getTime();
                const dayEndMs = dayStartMs + 86_400_000;
                const isToday = day.toDateString() === new Date().toDateString();

                const dayBookings = enriched.filter(
                  (b) => b.start < dayEndMs && b.end > dayStartMs
                );

                return (
                  <div
                    key={di}
                    className={cn("flex-1 border-l relative", isToday && "bg-emerald-50/30")}
                  >
                    {/* Hour gridlines */}
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                      <div
                        key={i}
                        className="absolute w-full border-t border-muted/30"
                        style={{ top: `${i * HOUR_HEIGHT}px` }}
                      />
                    ))}

                    {/* Now indicator */}
                    {isToday && (() => {
                      const nowHour = new Date().getHours() + new Date().getMinutes() / 60;
                      const topPx = (nowHour - START_HOUR) * HOUR_HEIGHT;
                      if (topPx < 0 || topPx > (END_HOUR - START_HOUR) * HOUR_HEIGHT) return null;
                      return (
                        <div
                          className="absolute w-full border-t-2 border-red-400 z-10"
                          style={{ top: `${topPx}px` }}
                        >
                          <div className="absolute -left-1 -top-1.5 w-3 h-3 rounded-full bg-red-400" />
                        </div>
                      );
                    })()}

                    {/* Booking blocks */}
                    {dayBookings.map((b) => {
                      const topHours = Math.max(
                        0,
                        (b.start - dayStartMs) / 3_600_000 - START_HOUR
                      );
                      const endHours = Math.min(
                        END_HOUR - START_HOUR,
                        (b.end - dayStartMs) / 3_600_000 - START_HOUR
                      );
                      const blockHeight = endHours - topHours;
                      if (blockHeight <= 0) return null;

                      const color = venueColor(b.venueId);
                      const tall = blockHeight * HOUR_HEIGHT >= 60;

                      return (
                        <button
                          key={b.id}
                          className={cn(
                            "absolute left-0.5 right-0.5 rounded border px-1.5 py-0.5 overflow-hidden text-left transition-opacity hover:opacity-80",
                            color.bg,
                            color.border,
                            color.text
                          )}
                          style={{
                            top: `${topHours * HOUR_HEIGHT}px`,
                            height: `${blockHeight * HOUR_HEIGHT}px`,
                            minHeight: "18px",
                          }}
                          onClick={() => {
                            if (b.end > now) {
                              setCancelTarget(b);
                              setCancelDialogOpen(true);
                            }
                          }}
                          title={`${b.venueName} · ${b.seatName}${b.label ? ` · ${b.label}` : ""}\n${formatTime(b.start)} – ${formatTime(b.end)}`}
                        >
                          <div className="text-[10px] font-semibold truncate">
                            {b.venueName}
                          </div>
                          {tall && (
                            <>
                              <div className="text-[10px] truncate">
                                {b.seatName}
                                {b.label && ` · ${b.label}`}
                              </div>
                              <div className="text-[9px] opacity-70 truncate">
                                {formatTime(b.start)} – {formatTime(b.end)}
                              </div>
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Cancel dialog */}
      {cancelTarget && (
        <CancelBookingDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          resourceName={`${cancelTarget.venueName} · Seat ${cancelTarget.seatName}`}
          start={cancelTarget.start}
          end={cancelTarget.end}
          onConfirm={handleCancel}
        />
      )}

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/50">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working...
          </div>
        </div>
      )}
    </div>
  );
}
