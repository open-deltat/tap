"use client";

import { useState, useEffect, useTransition } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTime } from "@/lib/time";
import { getBookings, cancelBooking } from "@/app/actions/bookings";
import type { Booking } from "@open-deltat/client";

function parseLabel(label: string | null): { name: string; email: string | null } {
  if (!label) return { name: "Unknown", email: null };
  const match = label.match(/^(.+?)\s*<(.+)>$/);
  if (match) return { name: match[1], email: match[2] };
  return { name: label, email: null };
}

export function BookingList() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isPending, startTransition] = useTransition();
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  useEffect(() => {
    getBookings().then(setBookings);
  }, []);

  const now = Date.now();
  const upcoming = bookings.filter((b) => b.end > now).sort((a, b) => a.start - b.start);
  const past = bookings.filter((b) => b.end <= now).sort((a, b) => b.start - a.start);

  function handleCancel(id: string) {
    setCancellingId(id);
    startTransition(async () => {
      try {
        await cancelBooking(id);
        setBookings((prev) => prev.filter((b) => b.id !== id));
        toast.success("Booking cancelled");
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Failed to cancel");
      } finally {
        setCancellingId(null);
      }
    });
  }

  function formatDate(ms: number) {
    return new Date(ms).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  function renderRow(booking: Booking, showCancel: boolean) {
    const { name, email } = parseLabel(booking.label);
    const isCancelling = cancellingId === booking.id;

    return (
      <tr key={booking.id} className="border-b last:border-0">
        <td className="px-4 py-3 text-sm">
          <div className="font-medium">{name}</div>
          {email && <div className="text-xs text-muted-foreground">{email}</div>}
        </td>
        <td className="px-4 py-3 text-sm">{formatDate(booking.start)}</td>
        <td className="px-4 py-3 text-sm">
          {formatTime(booking.start)} – {formatTime(booking.end)}
        </td>
        <td className="px-4 py-3 text-right">
          {showCancel ? (
            <Button
              variant="destructive"
              size="xs"
              onClick={() => handleCancel(booking.id)}
              disabled={isPending}
            >
              {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : "Cancel"}
            </Button>
          ) : (
            <Badge variant="secondary">Past</Badge>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium mb-2">
          Upcoming {upcoming.length > 0 && <Badge variant="outline" className="ml-1">{upcoming.length}</Badge>}
        </h3>
        {upcoming.length === 0 ? (
          <p className="text-sm text-muted-foreground">No upcoming bookings.</p>
        ) : (
          <div className="rounded-lg border">
            <table className="w-full">
              <tbody>{upcoming.map((b) => renderRow(b, true))}</tbody>
            </table>
          </div>
        )}
      </div>

      {past.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Past</h3>
          <div className="rounded-lg border">
            <table className="w-full">
              <tbody>{past.map((b) => renderRow(b, false))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
