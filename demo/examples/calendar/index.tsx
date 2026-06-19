"use client";

import { useEffect, useState, useCallback, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Stage } from "@/components/stage";
import { WeekCalendar } from "./week-calendar";
import { BookingDialog, CancelBookingDialog } from "@/components/booking-dialog";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { weekStart } from "@/lib/utils";
import { formatTime } from "@/lib/time";
import type { AvailabilitySlot, Booking, Resource } from "@/lib/schemas";
import { useWebSocket } from "@/hooks/use-websocket";

import { ensurePersonalCalendar } from "@/app/actions/seed-personal-calendar";
import { getAvailability } from "@/app/actions/availability";
import { bookSlot, cancelBooking, getBookingsForResource } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";

const NAME = "My Calendar";

function asResource(id: string): Resource {
  return {
    id,
    parentId: null,
    name: NAME,
    capacity: 1,
    bufferAfter: null,
    slotMinutes: 15,
    price: null,
    bufferMinutes: 0,
  };
}

export default function CalendarExample() {
  const [resourceId, setResourceId] = useState<string | null>(null);
  const [weekOf, setWeekOf] = useState(() => weekStart(new Date()));
  const [availability, setAvailability] = useState<AvailabilitySlot[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [bookingSlot, setBookingSlot] = useState<{ start: number; end: number } | null>(null);
  const [bookingLabel, setBookingLabel] = useState("");
  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);

  const loadData = useCallback(async (id: string, week: Date) => {
    const start = week.getTime();
    const end = start + 7 * 86_400_000;
    try {
      const [avail, bk] = await Promise.all([
        getAvailability(id, start, end),
        getBookingsForResource(id),
      ]);
      setAvailability(avail);
      setBookings(bk.filter((b) => b.start < end && b.end > start));
    } catch {
      toast.error("Failed to load calendar data");
    }
  }, []);

  useEffect(() => {
    ensurePersonalCalendar()
      .then(async (id) => {
        setResourceId(id);
        await loadData(id, weekOf);
      })
      .catch(() => toast.error("Failed to connect to deltat. Is it running?"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (resourceId) loadData(resourceId, weekOf);
  }, [weekOf, resourceId, loadData]);

  const onWsEvent = useCallback(() => {
    if (resourceId) loadData(resourceId, weekOf);
  }, [resourceId, weekOf, loadData]);
  useWebSocket(resourceId ? { type: "subscribe", resourceId, onEvent: onWsEvent } : null);

  function handleSlotClick(start: number, end: number) {
    setBookingSlot({ start, end });
    setBookingLabel("");
    setBookingDialogOpen(true);
  }

  function handleBookConfirm() {
    if (!resourceId || !bookingSlot) return;
    setBookingDialogOpen(false);
    const slot = bookingSlot;
    startTransition(async () => {
      try {
        const booking = await bookSlot({
          resourceId,
          start: slot.start,
          end: slot.end,
          label: bookingLabel.trim() || "Busy",
        });
        setResult({
          title: `${NAME} · booked`,
          subtitle: `${formatTime(slot.start)} – ${formatTime(slot.end)}`,
          bookings: [booking],
          resources: [asResource(resourceId)],
        });
        await loadData(resourceId, weekOf);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function handleBookingClick(booking: Booking) {
    setCancelTarget(booking);
    setCancelDialogOpen(true);
  }

  function handleCancelConfirm() {
    if (!cancelTarget || !resourceId) return;
    setCancelDialogOpen(false);
    startTransition(async () => {
      try {
        await cancelBooking(cancelTarget.id);
        await loadData(resourceId, weekOf);
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
          Connecting to deltat…
        </div>
      </div>
    );
  }

  return (
    <>
      <Stage
        primitive={{ label: "Week grid · single-resource booker", specId: "AVAIL-01" }}
        title={NAME}
      >
        <div className="h-[62vh]">
          <WeekCalendar
            weekOf={weekOf}
            onWeekChange={setWeekOf}
            availability={availability}
            bookings={bookings}
            slotMinutes={15}
            startHour={8}
            endHour={20}
            onSlotClick={handleSlotClick}
            onBookingClick={handleBookingClick}
          />
        </div>
      </Stage>

      {bookingSlot && (
        <BookingDialog
          open={bookingDialogOpen}
          onOpenChange={setBookingDialogOpen}
          resourceName={NAME}
          start={bookingSlot.start}
          end={bookingSlot.end}
          label={bookingLabel}
          onLabelChange={setBookingLabel}
          onConfirm={handleBookConfirm}
        />
      )}

      {cancelTarget && (
        <CancelBookingDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          resourceName={NAME}
          start={cancelTarget.start}
          end={cancelTarget.end}
          onConfirm={handleCancelConfirm}
        />
      )}

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working…
          </div>
        </div>
      )}
    </>
  );
}
