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
    <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-white/10 bg-[#070708] text-zinc-200 sm:flex">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Your session</div>
        <div className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Clock className="h-3 w-3" />
          {headlineSecs != null ? (
            <span>
              clears in <span className="font-mono text-emerald-300">0:{String(headlineSecs).padStart(2, "0")}</span>
            </span>
          ) : (
            <span>bookings auto-clear after {Math.round(ttlMs / 1000)}s</span>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {bookings.length === 0 ? (
          <p className="px-1 pt-2 text-[11px] leading-relaxed text-zinc-600">
            Book anything in a demo and it lands here, then auto-clears after {Math.round(ttlMs / 1000)} seconds,
            so the examples stay fresh for the next visitor.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {bookings.map(({ booking, expiresAt }) => {
              const remaining = Math.max(0, (expiresAt - now) / 1000);
              const frac = Math.max(0, Math.min(1, remaining / (ttlMs / 1000)));
              return (
                <li key={booking.id} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                  <div className="truncate text-xs font-medium text-zinc-100">
                    {booking.label || "Booking"}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-500">
                    {formatTime(booking.start)} to {formatTime(booking.end)}
                  </div>
                  <div className="mt-1.5 h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-1000 ease-linear",
                        frac > 0.4 ? "bg-emerald-400/70" : "bg-amber-400/80"
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

      <div className="border-t border-white/10 p-3">
        <button
          type="button"
          onClick={reset}
          disabled={clearing || bookings.length === 0}
          className={cn(
            "flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 px-3 py-2 text-xs transition-colors",
            bookings.length === 0
              ? "text-zinc-600"
              : "text-zinc-300 hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-rose-200"
          )}
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {clearing ? "Clearing…" : "Reset my bookings"}
        </button>
      </div>
    </aside>
  );
}
