"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { AvailabilitySlot, Booking } from "@/lib/schemas";

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

interface SeatMapProps {
  sections: SeatSection[];
  availabilityByResource: Map<string, AvailabilitySlot[]>;
  bookingsByResource: Map<string, Booking[]>;
  slotStart: number;
  slotEnd: number;
  selectedIds: Set<string>;
  onToggle: (seatId: string) => void;
  onBookingClick: (booking: Booking) => void;
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

function buildGrid(seats: SeatInfo[]): Grid {
  const parsed = seats.map((s) => ({ ...s, parsed: parseSeatName(s.name) }));
  const hasParsed = parsed.every((p) => p.parsed !== null);

  if (!hasParsed || seats.length === 0) {
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

  const allCols = [...new Set(parsed.map((p) => p.parsed!.col))].sort(sortMixed);
  const allRows = [...new Set(parsed.map((p) => p.parsed!.row))].sort(sortMixed);

  const seatByPos = new Map<string, SeatInfo>();
  for (const p of parsed) {
    seatByPos.set(`${p.parsed!.row}-${p.parsed!.col}`, { id: p.id, name: p.name });
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
  slotStart,
  slotEnd,
  onToggle,
  onBookingClick,
}: {
  section: SeatSection;
  grid: Grid;
  seatStatus: Map<string, "available" | "booked" | "unavailable">;
  selectedIds: Set<string>;
  bookingsByResource: Map<string, Booking[]>;
  slotStart: number;
  slotEnd: number;
  onToggle: (seatId: string) => void;
  onBookingClick: (booking: Booking) => void;
}) {
  const aisleAfter = getAisleAfter(grid.columns);

  // Count stats
  const stats = useMemo(() => {
    let available = 0;
    let booked = 0;
    let total = section.seats.length;
    for (const seat of section.seats) {
      const st = seatStatus.get(seat.id);
      if (st === "available") available++;
      else if (st === "booked") booked++;
    }
    return { available, booked, total };
  }, [section.seats, seatStatus]);

  return (
    <div className="flex flex-col items-center">
      {/* Section header */}
      <div className="mb-2 text-center">
        <div className="text-sm font-semibold">{section.name}</div>
        <div className="text-xs text-muted-foreground">
          {section.price !== null && (
            <span className="font-medium text-foreground">{formatPrice(section.price)}</span>
          )}
          {section.price !== null && " · "}
          {stats.available} available · {stats.booked} booked
        </div>
      </div>

      {/* Column headers */}
      <div className="flex items-center gap-0.5">
        <div className="w-7" />
        {grid.columns.map((col, ci) => (
          <div
            key={col}
            className={cn(
              "w-8 text-center text-[10px] font-medium text-muted-foreground",
              ci === aisleAfter && "mr-4"
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {/* Seat rows */}
      {grid.rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-0.5">
          <div className="w-7 text-right text-[10px] font-medium text-muted-foreground pr-0.5">
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

            return (
              <button
                key={seat.id}
                className={cn(
                  "w-8 h-8 rounded text-[10px] font-medium transition-all border",
                  st === "unavailable" &&
                    "bg-muted/40 text-muted-foreground/50 border-transparent cursor-not-allowed",
                  st === "available" &&
                    !isSelected &&
                    "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 hover:border-emerald-300 cursor-pointer",
                  st === "available" &&
                    isSelected &&
                    "bg-emerald-500 text-white border-emerald-600 ring-2 ring-emerald-300 cursor-pointer",
                  st === "booked" &&
                    "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200 cursor-pointer",
                  ci === aisleAfter && "mr-4"
                )}
                disabled={st === "unavailable"}
                onClick={() => {
                  if (st === "booked" && booking) {
                    onBookingClick(booking);
                  } else if (st === "available") {
                    onToggle(seat.id);
                  }
                }}
                title={
                  st === "booked"
                    ? `${seat.name} — ${booking?.label || "Booked"}`
                    : st === "available"
                      ? `${seat.name} — Available`
                      : `${seat.name} — Unavailable`
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
  slotStart,
  slotEnd,
  selectedIds,
  onToggle,
  onBookingClick,
}: SeatMapProps) {
  // Build grids for each section
  const grids = useMemo(
    () => sections.map((s) => buildGrid(s.seats)),
    [sections]
  );

  // Compute per-seat status across all sections
  const seatStatus = useMemo(() => {
    const status = new Map<string, "available" | "booked" | "unavailable">();
    for (const section of sections) {
      for (const seat of section.seats) {
        const avail = availabilityByResource.get(seat.id) ?? [];
        const bks = bookingsByResource.get(seat.id) ?? [];

        const hasBooking = bks.some((b) => b.start < slotEnd && b.end > slotStart);
        if (hasBooking) {
          status.set(seat.id, "booked");
          continue;
        }

        const isAvailable = avail.some((a) => a.start <= slotStart && a.end >= slotEnd);
        status.set(seat.id, isAvailable ? "available" : "unavailable");
      }
    }
    return status;
  }, [sections, availabilityByResource, bookingsByResource, slotStart, slotEnd]);

  return (
    <div className="flex flex-col items-center gap-6">
      {sections.map((section, i) => (
        <SectionGrid
          key={section.id}
          section={section}
          grid={grids[i]}
          seatStatus={seatStatus}
          selectedIds={selectedIds}
          bookingsByResource={bookingsByResource}
          slotStart={slotStart}
          slotEnd={slotEnd}
          onToggle={onToggle}
          onBookingClick={onBookingClick}
        />
      ))}

      {/* Legend */}
      <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-emerald-50 border border-emerald-200" />
          <span>Available</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-emerald-500 border border-emerald-600" />
          <span>Selected</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-blue-100 border border-blue-200" />
          <span>Booked</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3.5 h-3.5 rounded bg-muted/40 border border-transparent" />
          <span>Unavailable</span>
        </div>
      </div>
    </div>
  );
}
