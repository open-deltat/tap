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
    <aside className="hidden h-full w-64 shrink-0 flex-col border-r border-dt-line bg-dt-surface text-dt-ink sm:flex">
      <div className="border-b border-dt-line px-4 py-4">
        <div className="text-[13px] font-semibold text-dt-ink">Your session</div>
        <div className="mt-1 flex items-center gap-1.5 text-[12px] text-dt-ink-3">
          <Clock className="h-3 w-3" />
          {headlineSecs != null ? (
            <span>
              clears in <span className="font-medium tabular-nums text-dt-ink">0:{String(headlineSecs).padStart(2, "0")}</span>
            </span>
          ) : (
            <span>bookings auto-clear after {Math.round(ttlMs / 1000)}s</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {bookings.length === 0 ? (
          <p className="px-1 pt-2 text-[12.5px] leading-relaxed text-dt-ink-3">
            Book anything in a demo and it lands here, then auto-clears after {Math.round(ttlMs / 1000)} seconds,
            so the examples stay fresh for the next visitor.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bookings.map(({ booking, expiresAt }) => {
              const remaining = Math.max(0, (expiresAt - now) / 1000);
              const frac = Math.max(0, Math.min(1, remaining / (ttlMs / 1000)));
              return (
                <li key={booking.id} className="dt-rise rounded-xl border border-dt-line bg-dt-sunken p-2.5">
                  <div className="truncate text-[13px] font-medium text-dt-ink">
                    {booking.label || "Booking"}
                  </div>
                  <div className="mt-0.5 text-[11.5px] tabular-nums text-dt-ink-3">
                    {formatTime(booking.start)} to {formatTime(booking.end)}
                  </div>
                  <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-dt-line">
                    {/* scaleX, not width: the bar drains on the compositor instead of re-laying out every second. */}
                    <div
                      className={cn(
                        "h-full w-full origin-left rounded-full transition-transform duration-1000 ease-linear",
                        frac > 0.4 ? "bg-dt-accent" : "bg-dt-held"
                      )}
                      style={{ transform: `scaleX(${frac})` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-dt-line p-3">
        <button
          type="button"
          onClick={reset}
          disabled={clearing || bookings.length === 0}
          className={cn(
            "flex h-10 w-full items-center justify-center gap-1.5 rounded-full border border-dt-line px-3 text-[13px] transition-colors",
            bookings.length === 0
              ? "text-dt-ink-3/60"
              : "text-dt-ink-2 hover:border-dt-line-strong hover:bg-dt-sunken hover:text-dt-ink"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {clearing ? "Clearing…" : "Reset my bookings"}
        </button>
      </div>
    </aside>
  );
}
