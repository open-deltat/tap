"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { FitToWidth } from "@/components/fit-to-width";
import type { AvailabilitySlot, Booking } from "@open-deltat/examples/lib/schemas";
import type { Hold } from "@open-deltat/client";

interface SeatInfo {
  id: string;
  name: string;
}

export interface SeatSection {
  id: string;
  name: string;
  price: number | null;
  seats: SeatInfo[];
}

type SeatStatus = "available" | "booked" | "held" | "unavailable";

interface SeatMapProps {
  sections: SeatSection[];
  availabilityByResource: Map<string, AvailabilitySlot[]>;
  bookingsByResource: Map<string, Booking[]>;
  holdsByResource?: Map<string, Hold[]>;
  slotStart: number;
  slotEnd: number;
  selectedIds: Set<string>;
  onToggle: (seatId: string) => void;
  onBookingClick: (booking: Booking) => void;
  onHoldClick?: (hold: Hold) => void;
}

/** Parse seat name like "1A" or "A1" into { row, col }.
 *  Handles both number-first (plane/stadium) and letter-first (theater) formats. */
function parseSeatName(name: string): { row: string; col: string } | null {
  // "1A" format: row = number, col = letter
  const numFirst = name.match(/^(\d+)([A-Za-z]+)$/);
  if (numFirst) return { row: numFirst[1], col: numFirst[2].toUpperCase() };
  // "A1" format: row = letter, col = number
  const letterFirst = name.match(/^([A-Za-z]+)(\d+)$/);
  if (letterFirst) return { row: letterFirst[1].toUpperCase(), col: letterFirst[2] };
  return null;
}

function sortMixed(a: string, b: string): number {
  const aNum = parseInt(a, 10);
  const bNum = parseInt(b, 10);
  if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
  return a.localeCompare(b);
}

interface Grid {
  rows: (SeatInfo | null)[][];
  columns: string[];
  rowLabels: string[];
}

type ParsedSeat = SeatInfo & { parsed: { row: string; col: string } };

function buildGrid(seats: SeatInfo[]): Grid {
  const parsed = seats.map((s) => ({ ...s, parsed: parseSeatName(s.name) }));
  const resolved = parsed.filter((p): p is ParsedSeat => p.parsed !== null);

  if (resolved.length !== parsed.length || seats.length === 0) {
    const cols = Math.min(seats.length, 8);
    const rows: SeatInfo[][] = [];
    for (let i = 0; i < parsed.length; i += cols) {
      rows.push(parsed.slice(i, i + cols));
    }
    return {
      rows,
      columns: Array.from({ length: cols }, (_, i) => String(i + 1)),
      rowLabels: rows.map((_, i) => String(i + 1)),
    };
  }

  const allCols = [...new Set(resolved.map((p) => p.parsed.col))].sort(sortMixed);
  const allRows = [...new Set(resolved.map((p) => p.parsed.row))].sort(sortMixed);

  const seatByPos = new Map<string, SeatInfo>();
  for (const p of resolved) {
    seatByPos.set(`${p.parsed.row}-${p.parsed.col}`, { id: p.id, name: p.name });
  }

  const gridRows: (SeatInfo | null)[][] = allRows.map((row) =>
    allCols.map((col) => seatByPos.get(`${row}-${col}`) ?? null)
  );

  return { rows: gridRows, columns: allCols, rowLabels: allRows };
}

function getAisleAfter(cols: string[]): number {
  if (cols.length >= 12) return 5; // large venues: split after 6th
  if (cols.length === 6) return 2; // after 3rd column (index 2)
  if (cols.length === 4) return 1;
  return Math.floor(cols.length / 2) - 1;
}

function formatPrice(price: number): string {
  return price % 1 === 0 ? `$${price}` : `$${price.toFixed(2)}`;
}

function SectionGrid({
  section,
  grid,
  seatStatus,
  selectedIds,
  bookingsByResource,
  holdsByResource,
  slotStart,
  slotEnd,
  onToggle,
  onBookingClick,
  onHoldClick,
}: {
  section: SeatSection;
  grid: Grid;
  seatStatus: Map<string, SeatStatus>;
  selectedIds: Set<string>;
  bookingsByResource: Map<string, Booking[]>;
  holdsByResource?: Map<string, Hold[]>;
  slotStart: number;
  slotEnd: number;
  onToggle: (seatId: string) => void;
  onBookingClick: (booking: Booking) => void;
  onHoldClick?: (hold: Hold) => void;
}) {
  const aisleAfter = getAisleAfter(grid.columns);

  const stats = useMemo(() => {
    let available = 0;
    let booked = 0;
    let held = 0;
    for (const seat of section.seats) {
      const st = seatStatus.get(seat.id);
      if (st === "available") available++;
      else if (st === "booked") booked++;
      else if (st === "held") held++;
    }
    return { available, booked, held };
  }, [section.seats, seatStatus]);

  return (
    <div className="flex flex-col items-center">
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold text-zinc-100">{section.name}</div>
        <div className="text-xs text-zinc-500">
          {section.price !== null && (
            <span className="font-medium text-zinc-300">{formatPrice(section.price)}</span>
          )}
          {section.price !== null && " · "}
          {stats.available} available{stats.held > 0 && ` · ${stats.held} held`} · {stats.booked} booked
        </div>
      </div>

      <div className="flex items-center gap-0.5">
        <div className="w-7" />
        {grid.columns.map((col, ci) => (
          <div
            key={col}
            className={cn(
              "w-8 text-center text-[10px] font-medium text-zinc-600",
              ci === aisleAfter && "mr-4"
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {grid.rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-0.5">
          <div className="w-7 text-right text-[10px] font-medium text-zinc-600 pr-0.5">
            {grid.rowLabels[ri]}
          </div>
          {row.map((seat, ci) => {
            if (!seat) {
              return (
                <div
                  key={`empty-${ri}-${ci}`}
                  className={cn("w-8 h-8", ci === aisleAfter && "mr-4")}
                />
              );
            }

            const st = seatStatus.get(seat.id) ?? "unavailable";
            const isSelected = selectedIds.has(seat.id);
            const booking = (bookingsByResource.get(seat.id) ?? []).find(
              (b) => b.start < slotEnd && b.end > slotStart
            );
            const now = Date.now();
            const hold = (holdsByResource?.get(seat.id) ?? []).find(
              (h) => h.start < slotEnd && h.end > slotStart && h.expiresAt > now
            );

            // A selected seat is one YOU are holding right now. Your own hold removes the seat's
            // availability and is filtered out of holdsByResource, so its recomputed status would
            // otherwise read "unavailable". isSelected therefore wins: always show it as your hold
            // (violet) and keep it clickable so you can release it.
            return (
              <button
                key={seat.id}
                className={cn(
                  "w-8 h-8 rounded text-[10px] font-medium transition-all border",
                  isSelected &&
                    "bg-violet-500/80 text-white border-violet-300 ring-2 ring-violet-300/60 cursor-pointer",
                  !isSelected &&
                    st === "unavailable" &&
                    "bg-white/[0.03] text-zinc-600 border-white/[0.06] cursor-not-allowed",
                  !isSelected &&
                    st === "available" &&
                    "bg-emerald-500/15 text-emerald-200 border-emerald-400/30 hover:bg-emerald-500/25 hover:border-emerald-400/50 cursor-pointer",
                  !isSelected &&
                    st === "held" &&
                    "bg-amber-400/55 text-amber-50 border-amber-400/60 hover:bg-amber-400/70 cursor-pointer",
                  !isSelected &&
                    st === "booked" &&
                    "bg-rose-500/25 text-rose-200 border-rose-400/40 hover:bg-rose-500/35 cursor-pointer",
                  ci === aisleAfter && "mr-4"
                )}
                disabled={!isSelected && st === "unavailable"}
                onClick={() => {
                  if (isSelected) {
                    onToggle(seat.id);
                  } else if (st === "booked" && booking) {
                    onBookingClick(booking);
                  } else if (st === "held" && hold && onHoldClick) {
                    onHoldClick(hold);
                  } else if (st === "available") {
                    onToggle(seat.id);
                  }
                }}
                title={
                  isSelected
                    ? `${seat.name}, holding`
                    : st === "booked"
                      ? `${seat.name}, ${booking?.label || "booked"}`
                      : st === "held"
                        ? `${seat.name}, on hold`
                        : st === "available"
                          ? `${seat.name}, free`
                          : `${seat.name}, not available`
                }
              >
                {seat.name}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function SeatMap({
  sections,
  availabilityByResource,
  bookingsByResource,
  holdsByResource,
  slotStart,
  slotEnd,
  selectedIds,
  onToggle,
  onBookingClick,
  onHoldClick,
}: SeatMapProps) {
  const grids = useMemo(
    () => sections.map((s) => buildGrid(s.seats)),
    [sections]
  );

  const seatStatus = useMemo(() => {
    const now = Date.now();
    const status = new Map<string, SeatStatus>();
    for (const section of sections) {
      for (const seat of section.seats) {
        const avail = availabilityByResource.get(seat.id) ?? [];
        const bks = bookingsByResource.get(seat.id) ?? [];

        const hasBooking = bks.some((b) => b.start < slotEnd && b.end > slotStart);
        if (hasBooking) {
          status.set(seat.id, "booked");
          continue;
        }

        const holds = holdsByResource?.get(seat.id) ?? [];
        const hasHold = holds.some((h) => h.start < slotEnd && h.end > slotStart && h.expiresAt > now);
        if (hasHold) {
          status.set(seat.id, "held");
          continue;
        }

        const isAvailable = avail.some((a) => a.start <= slotStart && a.end >= slotEnd);
        status.set(seat.id, isAvailable ? "available" : "unavailable");
      }
    }
    return status;
  }, [sections, availabilityByResource, bookingsByResource, holdsByResource, slotStart, slotEnd]);

  return (
    <div className="flex flex-col items-center gap-6">
      {/* On phones the fixed-size grid is uniformly scaled down to fit the width (all seats keep the
          same shape); desktop is wide enough that the scale is 1, a no-op. */}
      <FitToWidth>
        <div className="flex flex-col items-center gap-6">
          {sections.map((section, i) => (
            <SectionGrid
              key={section.id}
              section={section}
              grid={grids[i]}
              seatStatus={seatStatus}
              selectedIds={selectedIds}
              bookingsByResource={bookingsByResource}
              holdsByResource={holdsByResource}
              slotStart={slotStart}
              slotEnd={slotEnd}
              onToggle={onToggle}
              onBookingClick={onBookingClick}
              onHoldClick={onHoldClick}
            />
          ))}
        </div>
      </FitToWidth>

      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-2 text-xs text-zinc-500">
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-emerald-500/15 border border-emerald-400/30" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-violet-500/80 border border-violet-300" />
          <span>Holding (you)</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-amber-400/55 border border-amber-400/60" />
          <span>Held</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-rose-500/25 border border-rose-400/40" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-white/[0.03] border border-white/[0.06]" />
          <span>Unavailable</span>
        </div>
      </div>
    </div>
  );
}
