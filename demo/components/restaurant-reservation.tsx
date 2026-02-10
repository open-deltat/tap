"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Check, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { toLocalDateString, formatTime, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import { getTablesForPartySize } from "@/app/actions/restaurant";
import { getAvailability } from "@/app/actions/availability";
import { RestaurantFloorPlan } from "@/components/restaurant-floor-plan";
import { RestaurantTimePicker } from "@/components/restaurant-time-picker";
import { useHoldWebSocket, useWebSocket } from "@/hooks/use-websocket";
import type { AvailabilitySlot } from "@open-tap/client";

interface Table {
  id: string;
  name: string;
  section: string;
  maxGuests: number;
}

interface ReservationProps {
  restaurantId: string;
}

export function RestaurantReservation({ restaurantId }: ReservationProps) {
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [tables, setTables] = useState<Table[]>([]);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableAvailability, setTableAvailability] = useState<AvailabilitySlot[]>([]);
  const [availableTableIds, setAvailableTableIds] = useState<Set<string>>(new Set());
  const [selectedTime, setSelectedTime] = useState<{ start: number; end: number } | null>(null);
  const [guestName, setGuestName] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load tables that fit party size
  useEffect(() => {
    getTablesForPartySize(restaurantId, partySize)
      .then((t) => {
        setTables(t);
        setSelectedTable(null);
        setSelectedTime(null);
        setConfirmed(false);
      })
      .catch(() => setTables([]));
  }, [restaurantId, partySize]);

  // Check availability for all tables on selected date
  useEffect(() => {
    if (tables.length === 0) return;
    const d = new Date(date + "T00:00:00");
    const { dayStart, dayEnd } = dayBounds(d);

    Promise.all(
      tables.map(async (t) => {
        const slots = await getAvailability(t.id, dayStart, dayEnd);
        return { id: t.id, available: slots.length > 0 };
      })
    ).then((results) => {
      setAvailableTableIds(new Set(results.filter((r) => r.available).map((r) => r.id)));
    });
  }, [tables, date]);

  // Load table-specific availability when selected
  useEffect(() => {
    if (!selectedTable) {
      setTableAvailability([]);
      return;
    }
    const d = new Date(date + "T00:00:00");
    const { dayStart, dayEnd } = dayBounds(d);

    getAvailability(selectedTable, dayStart, dayEnd)
      .then(setTableAvailability)
      .catch(() => setTableAvailability([]));
  }, [selectedTable, date]);

  const onWsEvent = useCallback(() => {
    if (!selectedTable) return;
    const d = new Date(date + "T00:00:00");
    const { dayStart, dayEnd } = dayBounds(d);
    getAvailability(selectedTable, dayStart, dayEnd)
      .then(setTableAvailability)
      .catch(() => {});
  }, [selectedTable, date]);

  useWebSocket(
    restaurantId ? { type: "subscribe", resourceId: restaurantId, onEvent: onWsEvent } : null
  );

  const holdOpts = selectedTime && selectedTable && !confirmed
    ? { resourceId: selectedTable, start: selectedTime.start, end: selectedTime.end, onEvent: onWsEvent }
    : null;
  const { connected, confirm } = useHoldWebSocket(holdOpts);

  function prevDay() {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    setDate(toLocalDateString(d));
    setSelectedTable(null);
    setSelectedTime(null);
    setConfirmed(false);
  }

  function nextDay() {
    const d = new Date(date);
    d.setDate(d.getDate() + 1);
    setDate(toLocalDateString(d));
    setSelectedTable(null);
    setSelectedTime(null);
    setConfirmed(false);
  }

  function handleSelectTable(id: string) {
    setSelectedTable(id === selectedTable ? null : id);
    setSelectedTime(null);
    setConfirmed(false);
  }

  function handleSelectTime(start: number, end: number) {
    setSelectedTime({ start, end });
    setConfirmed(false);
  }

  function handleConfirm() {
    if (!selectedTime || !selectedTable) return;
    startTransition(async () => {
      try {
        await confirm(guestName || undefined);
        setConfirmed(true);
        toast.success("Reservation confirmed!");
      } catch (err: any) {
        toast.error(formatError(err.message));
      }
    });
  }

  function handleNewReservation() {
    setSelectedTable(null);
    setSelectedTime(null);
    setConfirmed(false);
    setGuestName("");
  }

  const selectedTableObj = tables.find((t) => t.id === selectedTable);

  return (
    <div className="flex h-full">
      {/* Left controls */}
      <div className="w-72 shrink-0 border-r overflow-auto">
        <div className="p-5 space-y-5">
          {/* Party size */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Party Size</Label>
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <button
                    key={n}
                    onClick={() => setPartySize(n)}
                    className={cn(
                      "h-8 w-8 rounded-md text-xs font-medium transition-colors",
                      partySize === n
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    )}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Date picker */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Date</Label>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={prevDay}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setSelectedTable(null); setSelectedTime(null); }} className="text-sm" />
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={nextDay}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Time picker for selected table */}
          {selectedTable && (
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Time — {selectedTableObj?.name} ({selectedTableObj?.section})
              </Label>
              <RestaurantTimePicker
                slots={tableAvailability}
                selectedStart={selectedTime?.start ?? null}
                onSelect={handleSelectTime}
              />
            </div>
          )}

          {/* Confirmation */}
          {selectedTime && !confirmed && (
            <div className="rounded-lg border bg-card p-4 space-y-3">
              <div className="text-sm font-medium">
                {selectedTableObj?.name} · {formatTime(selectedTime.start)} – {formatTime(selectedTime.end)}
              </div>
              <div className="text-xs text-muted-foreground">
                {partySize} guest{partySize > 1 ? "s" : ""} · {selectedTableObj?.section}
              </div>
              {connected && (
                <div className="flex items-center gap-1.5 text-xs text-amber-600">
                  <div className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  Table held for you (5 min)
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs">Name</Label>
                <Input placeholder="Guest name" value={guestName} onChange={(e) => setGuestName(e.target.value)} className="text-sm" />
              </div>
              <Button onClick={handleConfirm} disabled={isPending || !connected} className="w-full" size="sm">
                {isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                Confirm Reservation
              </Button>
            </div>
          )}

          {confirmed && (
            <div className="space-y-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-4 flex items-center gap-3">
                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900 flex items-center justify-center shrink-0">
                  <Check className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <div className="text-sm font-medium text-emerald-800 dark:text-emerald-300">Reserved!</div>
                  <div className="text-xs text-emerald-600 dark:text-emerald-400">
                    {selectedTableObj?.name} · {selectedTime && formatTime(selectedTime.start)}
                  </div>
                </div>
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={handleNewReservation}>
                New Reservation
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Right: floor plan */}
      <div className="flex-1 overflow-auto p-8">
        <div className="mb-4">
          <h3 className="text-sm font-medium">Floor Plan</h3>
          <p className="text-xs text-muted-foreground">
            Tables for {partySize}+ guests ·{" "}
            {new Date(date + "T00:00:00").toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </p>
        </div>
        {tables.length === 0 ? (
          <div className="rounded-md border border-dashed p-8 text-center">
            <div className="text-sm text-muted-foreground">No tables available for {partySize} guests</div>
          </div>
        ) : (
          <RestaurantFloorPlan
            tables={tables}
            availableIds={availableTableIds}
            selectedId={selectedTable}
            onSelect={handleSelectTable}
          />
        )}
      </div>
    </div>
  );
}
