"use client";

import { useCallback, useEffect, useState } from "react";
import { RotateCcw, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import { getMyBookings, clearMyBookings } from "@/app/actions/session";

interface MyBooking {
  booking: { id: string; resourceId: string; start: number; end: number; label: string | null };
  expiresAt: number;
}

export function SessionSidebar() {
  const [bookings, setBookings] = useState<MyBooking[]>([]);
  const [ttlMs, setTtlMs] = useState(30_000);
  const [now, setNow] = useState(() => Date.now());
  const [clearing, setClearing] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await getMyBookings();
      setBookings(res.bookings);
      setTtlMs(res.ttlMs);
    } catch {
      /* ignore transient errors */
    }
  }, []);

  // Poll once a second: refreshes the list AND ticks the countdowns.
  useEffect(() => {
    refresh();
    const id = setInterval(() => {
      setNow(Date.now());
      refresh();
    }, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  async function reset() {
    setClearing(true);
    try {
      await clearMyBookings();
      await refresh();
    } finally {
      setClearing(false);
    }
  }

  const soonest = bookings.reduce((min, b) => Math.min(min, b.expiresAt), Infinity);
  const headlineSecs = bookings.length > 0 ? Math.max(0, Math.ceil((soonest - now) / 1000)) : null;

  return (
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-line bg-canvas text-ink sm:flex">
      <div className="border-b border-line px-4 py-3">
        <div className="text-sm font-medium tracking-tight text-ink">Your session</div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-ink-2">
          <Clock aria-hidden className="size-3.5" />
          {headlineSecs != null ? (
            <span>
              clears in <span className="font-mono tabular-nums text-signal">0:{String(headlineSecs).padStart(2, "0")}</span>
            </span>
          ) : (
            <span>bookings auto-clear after {Math.round(ttlMs / 1000)}s</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {bookings.length === 0 ? (
          <p className="text-pretty px-1 pt-2 text-xs leading-relaxed text-ink-2">
            Book anything in a demo and it lands here, then auto-clears after {Math.round(ttlMs / 1000)} seconds,
            so the examples stay fresh for the next visitor.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bookings.map(({ booking, expiresAt }) => {
              const remaining = Math.max(0, (expiresAt - now) / 1000);
              const frac = Math.max(0, Math.min(1, remaining / (ttlMs / 1000)));
              return (
                <li key={booking.id} className="rounded-[3px] border border-line bg-panel p-3">
                  <div className="truncate text-sm font-medium text-ink">
                    {booking.label || "Booking"}
                  </div>
                  <div className="mt-0.5 font-mono text-xs tabular-nums text-ink-2">
                    {formatTime(booking.start)} to {formatTime(booking.end)}
                  </div>
                  <div className="mt-2 h-[3px] w-full overflow-hidden bg-line">
                    <div
                      className={cn(
                        "h-full transition-[width] duration-1000 ease-linear motion-reduce:transition-none",
                        frac > 0.4 ? "bg-signal" : "bg-hold"
                      )}
                      style={{ width: `${frac * 100}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-line p-3">
        <button
          type="button"
          onClick={reset}
          disabled={clearing || bookings.length === 0}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-2 rounded-[3px] border border-line px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-signal",
            bookings.length === 0 ? "text-ink-2 opacity-60" : "text-ink hover:border-line-strong hover:bg-line"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {clearing ? "Clearing…" : "Reset my bookings"}
        </button>
      </div>
    </aside>
  );
}
