"use client";

import { useState, useEffect, useCallback, useTransition } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, Loader2, Minus, Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { RestaurantFloorPlan, type FloorTable, type FloorBar } from "./restaurant-floor-plan";
import { RestaurantTimePicker, restaurantTimeSlots } from "./restaurant-time-picker";
import { toLocalDateString, formatTime, dayBounds } from "@/lib/time";
import { formatError } from "@/lib/format-error";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";

import { getTablesForPartySize, getBar } from "./actions";
import { getResources } from "@/app/actions/resources";
import { getAvailability, getMultiResourceAvailability } from "@/app/actions/availability";
import { getBookingsForResource, batchBookSlots } from "@/app/actions/bookings";
import { useWebSocket } from "@/hooks/use-websocket";

const MAX_PARTY = 8;

interface Table {
  id: string;
  name: string;
  section: string;
  maxGuests: number;
}

interface Bar {
  id: string;
  name: string;
  capacity: number;
  price: number | null;
}

interface ReservationProps {
  restaurantId: string;
}

export function RestaurantReservation({ restaurantId }: ReservationProps) {
  const [partySize, setPartySize] = useState(2);
  const [date, setDate] = useState(toLocalDateString(new Date()));
  const [isPending, startTransition] = useTransition();

  const [resources, setResources] = useState<Resource[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [bar, setBar] = useState<Bar | null>(null);

  const [timeSlots, setTimeSlots] = useState<{ start: number; end: number }[]>([]);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);

  const [freeTableIds, setFreeTableIds] = useState<Set<string>>(new Set());
  const [barRemaining, setBarRemaining] = useState(0);

  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [barSelected, setBarSelected] = useState(false);
  const [result, setResult] = useState<BookingResult | null>(null);

  // Tables that fit the party + the bar — re-fetched when party size changes.
  useEffect(() => {
    getTablesForPartySize(restaurantId, partySize)
      .then(setTables)
      .catch(() => setTables([]));
    getBar(restaurantId)
      .then(setBar)
      .catch(() => setBar(null));
    setSelectedTableId(null);
    setBarSelected(false);
  }, [restaurantId, partySize]);

  // The restaurant's open hours for the chosen day → discrete 90-min slots.
  useEffect(() => {
    const { dayStart, dayEnd } = dayBounds(new Date(`${date}T00:00:00`));
    getAvailability(restaurantId, dayStart, dayEnd)
      .then((slots: AvailabilitySlot[]) => {
        const discrete = restaurantTimeSlots(slots);
        setTimeSlots(discrete);
        setSlot(discrete.length > 0 ? discrete[0] : null);
      })
      .catch(() => {
        setTimeSlots([]);
        setSlot(null);
      });
  }, [restaurantId, date]);

  // For the chosen slot: which tables are free (a table closed by the blocking rule for
  // tonight's service shows unavailable) and how many bar seats remain.
  const refresh = useCallback(async () => {
    if (!slot || tables.length === 0) {
      setFreeTableIds(new Set());
      return;
    }
    const tableIds = tables.map((t) => t.id);
    const [availMap, barBks] = await Promise.all([
      getMultiResourceAvailability(tableIds, slot.start, slot.end),
      bar ? getBookingsForResource(bar.id) : Promise.resolve([] as Booking[]),
    ]);
    const free = new Set<string>();
    for (const [id, slots] of Object.entries(availMap)) {
      if (slots.some((s) => s.start <= slot.start && s.end >= slot.end)) free.add(id);
    }
    setFreeTableIds(free);
    if (bar) {
      const taken = barBks.filter((b) => b.start < slot.end && b.end > slot.start).length;
      setBarRemaining(Math.max(0, bar.capacity - taken));
    }
  }, [slot, tables, bar]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // A bubbled BookingConfirmed/Cancelled (yours or another client's) re-derives free tables
  // and bar remaining for the current slot.
  const onWsEvent = useCallback(() => {
    if (isPending) return;
    refresh();
  }, [isPending, refresh]);
  useWebSocket(restaurantId ? { type: "subscribe", resourceId: restaurantId, onEvent: onWsEvent } : null);

  // Seed-independent: pull full Resource rows once for the modal's deltat record.
  useEffect(() => {
    getResources().then(setResources).catch(() => setResources([]));
  }, [restaurantId]);

  function shiftDay(delta: number) {
    const d = new Date(date);
    d.setDate(d.getDate() + delta);
    setDate(toLocalDateString(d));
    setSelectedTableId(null);
    setBarSelected(false);
  }

  function pickTable(id: string) {
    setBarSelected(false);
    setSelectedTableId((cur) => (cur === id ? null : id));
  }

  function pickBar() {
    setSelectedTableId(null);
    setBarSelected((cur) => !cur);
    setPartySize((p) => Math.min(p, barRemaining || p));
  }

  const selectedTable = tables.find((t) => t.id === selectedTableId) ?? null;

  function bookTable() {
    if (!selectedTable || !slot) return;
    const resource = resources.find((r) => r.id === selectedTable.id);
    startTransition(async () => {
      try {
        const created = await batchBookSlots([
          {
            resourceId: selectedTable.id,
            start: slot.start,
            end: slot.end,
            label: `${selectedTable.section} · ${selectedTable.name} · ${partySize} guests`,
          },
        ]);
        setResult({
          title: `${selectedTable.name} · ${partySize} guest${partySize > 1 ? "s" : ""}`,
          subtitle: `${selectedTable.section} · ${formatTime(slot.start)} – ${formatTime(slot.end)}`,
          bookings: created,
          resources: resource ? [resource] : undefined,
        });
        setSelectedTableId(null);
        await refresh();
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function bookBar() {
    if (!bar || !slot) return;
    const k = Math.min(partySize, barRemaining);
    if (k <= 0) return;
    const resource = resources.find((r) => r.id === bar.id);
    const rows = Array.from({ length: k }, () => ({
      resourceId: bar.id,
      start: slot.start,
      end: slot.end,
      label: `Bar · party of ${k}`,
    }));
    startTransition(async () => {
      try {
        const created = await batchBookSlots(rows);
        setResult({
          title: `Bar · ${k} seat${k > 1 ? "s" : ""}`,
          subtitle: `${formatTime(slot.start)} – ${formatTime(slot.end)}`,
          bookings: created,
          resources: resource ? [resource] : undefined,
        });
        setBarSelected(false);
        await refresh();
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  const floorTables: FloorTable[] = tables.map((t) => ({
    ...t,
    available: freeTableIds.has(t.id),
  }));
  const floorBar: FloorBar | null = bar
    ? { id: bar.id, name: bar.name, capacity: bar.capacity, remaining: barRemaining }
    : null;

  const dateLabel = new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

  const ribbon = (
    <div className="flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-zinc-400">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => shiftDay(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[150px] text-center text-xs text-zinc-300">{dateLabel}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => shiftDay(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-zinc-500" />
          {Array.from({ length: MAX_PARTY }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPartySize(n)}
              className={cn(
                "h-7 w-7 rounded-md text-xs font-medium transition-colors",
                partySize === n
                  ? "bg-emerald-500 text-white"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10"
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <RestaurantTimePicker
        slots={timeSlots}
        selectedStart={slot?.start ?? null}
        onSelect={(start, end) => {
          setSlot({ start, end });
          setSelectedTableId(null);
          setBarSelected(false);
        }}
      />
    </div>
  );

  const tray =
    selectedTable && slot ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-100">
            {selectedTable.section} · {selectedTable.name}
          </div>
          <div className="text-xs text-zinc-400">
            {partySize} guest{partySize > 1 ? "s" : ""} · {formatTime(slot.start)} – {formatTime(slot.end)}
          </div>
        </div>
        <Button
          onClick={bookTable}
          disabled={isPending}
          className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
        >
          Reserve table
        </Button>
      </div>
    ) : bar && barSelected && barRemaining > 0 && slot ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-100">{bar.name}</div>
          <div className="text-xs text-zinc-400">
            {barRemaining} of {bar.capacity} free · {formatTime(slot.start)} – {formatTime(slot.end)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => setPartySize((p) => Math.max(1, p - 1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center font-mono text-sm text-zinc-100">
            {Math.min(partySize, barRemaining)}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => setPartySize((p) => Math.min(MAX_PARTY, barRemaining, p + 1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <Button
          onClick={bookBar}
          disabled={isPending}
          className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400"
        >
          Book {Math.min(partySize, barRemaining)} seat{Math.min(partySize, barRemaining) > 1 ? "s" : ""}
        </Button>
      </div>
    ) : undefined;

  const surface =
    timeSlots.length === 0 ? (
      <div className="py-16 text-center text-sm text-zinc-400">No service today.</div>
    ) : tables.length === 0 && !bar ? (
      <div className="py-16 text-center text-sm text-zinc-400">No tables fit a party of {partySize}.</div>
    ) : (
      <RestaurantFloorPlan
        tables={floorTables}
        bar={floorBar}
        selectedTableId={selectedTableId}
        barSelected={barSelected}
        onSelectTable={pickTable}
        onSelectBar={pickBar}
      />
    );

  return (
    <>
      <Stage
        primitive={{ label: "Collision · tables + capacity bar", specId: "AVAIL-03" }}
        title="Bella Cucina"
        ribbon={ribbon}
        tray={tray}
      >
        {surface}
      </Stage>

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
