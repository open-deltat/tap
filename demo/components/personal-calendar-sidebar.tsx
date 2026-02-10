"use client";

import { useEffect, useRef, useTransition } from "react";
import { CalendarDays, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { usePersonalCalendar } from "./personal-calendar-provider";
import { clearBookingsForResource } from "@/app/actions/bookings";
import type { Booking, Hold } from "@open-tap/client";

const START_HOUR = 6;
const END_HOUR = 22;
const HOUR_HEIGHT = 40;
const TOTAL_HOURS = END_HOUR - START_HOUR;

function hourToY(hour: number): number {
  return (hour - START_HOUR) * HOUR_HEIGHT;
}

function msToY(ms: number): number {
  const d = new Date(ms);
  const hour = d.getHours() + d.getMinutes() / 60;
  return hourToY(Math.max(START_HOUR, Math.min(END_HOUR, hour)));
}

interface Band {
  top: number;
  height: number;
  label: string;
  type: "booking" | "hold";
}

function toBands(bookings: Booking[], holds: Hold[]): Band[] {
  const bands: Band[] = [];

  for (const b of bookings) {
    const top = msToY(b.start);
    const bottom = msToY(b.end);
    bands.push({
      top,
      height: Math.max(bottom - top, 4),
      label: b.label ?? "Booked",
      type: "booking",
    });
  }

  for (const h of holds) {
    const top = msToY(h.start);
    const bottom = msToY(h.end);
    bands.push({
      top,
      height: Math.max(bottom - top, 4),
      label: "Hold",
      type: "hold",
    });
  }

  return bands;
}

function CurrentTimeLine() {
  const now = new Date();
  const hour = now.getHours() + now.getMinutes() / 60;
  if (hour < START_HOUR || hour > END_HOUR) return null;

  return (
    <div
      className="absolute left-0 right-0 z-20 pointer-events-none"
      style={{ top: hourToY(hour) }}
    >
      <div className="relative flex items-center">
        <div className="h-2 w-2 rounded-full bg-red-500 -ml-1" />
        <div className="flex-1 h-px bg-red-500" />
      </div>
    </div>
  );
}

export function PersonalCalendarSidebar() {
  const { calendarId, bookings, holds } = usePersonalCalendar();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const hour = now.getHours();
    const scrollTo = Math.max(0, hourToY(hour) - 80);
    scrollRef.current.scrollTop = scrollTo;
  }, [calendarId]);

  if (!calendarId) return null;

  const bands = toBands(bookings, holds);
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  function handleClear() {
    if (!calendarId) return;
    startTransition(async () => {
      const count = await clearBookingsForResource(calendarId);
      toast.success(`Cleared ${count} booking${count !== 1 ? "s" : ""}`);
    });
  }

  return (
    <div className="w-56 shrink-0 border-l flex flex-col bg-background">
      <div className="px-3 py-2.5 border-b flex items-center gap-2">
        <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
        <div className="text-xs font-medium">My Calendar</div>
        <div className="ml-auto text-[10px] text-muted-foreground">{today}</div>
      </div>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-auto">
        <div className="relative" style={{ height: TOTAL_HOURS * HOUR_HEIGHT }}>
          {Array.from({ length: TOTAL_HOURS }, (_, i) => {
            const hour = START_HOUR + i;
            return (
              <div
                key={hour}
                className="absolute left-0 right-0 border-b border-border/40"
                style={{ top: i * HOUR_HEIGHT, height: HOUR_HEIGHT }}
              >
                <span className="absolute top-0 left-2 -translate-y-1/2 text-[10px] text-muted-foreground bg-background px-0.5">
                  {hour === 0 ? "12a" : hour < 12 ? `${hour}a` : hour === 12 ? "12p" : `${hour - 12}p`}
                </span>
              </div>
            );
          })}

          <CurrentTimeLine />

          {bands.map((band, i) => (
            <div
              key={i}
              className={cn(
                "absolute left-8 right-2 rounded-sm px-1.5 py-0.5 text-[10px] leading-tight overflow-hidden z-10",
                band.type === "booking"
                  ? "bg-emerald-100 text-emerald-800 border border-emerald-200"
                  : "bg-amber-100 text-amber-800 border border-amber-200 animate-pulse"
              )}
              style={{ top: band.top, height: band.height }}
              title={band.label}
            >
              <div className="truncate font-medium">{band.label}</div>
            </div>
          ))}

          {bands.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-[10px] text-muted-foreground/50">No events today</div>
            </div>
          )}
        </div>
      </div>

      {bookings.length > 0 && (
        <div className="border-t px-3 py-2">
          <button
            className="flex w-full items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[10px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors disabled:opacity-50"
            onClick={handleClear}
            disabled={isPending}
          >
            <Trash2 className="h-3 w-3" />
            Clear calendar
          </button>
        </div>
      )}
    </div>
  );
}
