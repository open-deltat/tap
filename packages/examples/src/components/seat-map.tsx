"use client";

import { useMemo } from "react";
import { cn } from "@open-deltat/shared/utils";
import { FitToWidth } from "./fit-to-width";
import type { SeatInfo, SeatSection } from "../lib/seat-sections";
import type { AvailabilitySlot, Booking } from "../lib/schemas";
import type { Hold } from "@open-deltat/client";

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
        <div className="text-[15px] font-semibold tracking-tight text-dt-ink">{section.name}</div>
        <div className="mt-0.5 text-xs tabular-nums text-dt-ink-3">
          {section.price !== null && (
            <span className="font-medium text-dt-ink-2">{formatPrice(section.price)}</span>
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
              "w-8 text-center text-[10px] font-medium text-dt-ink-3",
              ci === aisleAfter && "mr-4"
            )}
          >
            {col}
          </div>
        ))}
      </div>

      {grid.rows.map((row, ri) => (
        <div key={ri} className="flex items-center gap-0.5">
          <div className="w-7 pr-1 text-right text-[10px] font-medium text-dt-ink-3">
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
            // (ink, the selection colour) and keep it clickable so you can release it. A seat someone
            // else holds is keyed by its hold, so it flashes once (dt-ping) the moment it changes.
            return (
              <button
                key={st === "held" && hold ? `${seat.id}-${hold.id}` : seat.id}
                className={cn(
                  "h-8 w-8 rounded-b-[6px] rounded-t-[11px] border text-[10px] font-medium tabular-nums transition-[background-color,border-color,color,transform] duration-150 active:scale-90",
                  isSelected && "cursor-pointer border-transparent bg-dt-ink text-dt-on-ink shadow-[0_0_0_3px_var(--dt-accent-soft)]",
                  !isSelected &&
                    st === "unavailable" &&
                    "cursor-not-allowed border-dashed border-dt-line bg-transparent text-dt-ink-3/40",
                  !isSelected &&
                    st === "available" &&
                    "cursor-pointer border-dt-line-strong bg-dt-surface text-dt-ink-2 hover:border-dt-ink hover:text-dt-ink",
                  !isSelected &&
                    st === "held" &&
                    "dt-ping cursor-pointer border-dt-held bg-dt-held-soft text-dt-held-ink",
                  !isSelected &&
                    st === "booked" &&
                    "cursor-pointer border-transparent bg-dt-taken text-dt-ink-3/60 line-through decoration-dt-ink-3/40",
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

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("h-3.5 w-3.5 rounded-b-[3px] rounded-t-[5px] border", swatch)} />
      <span>{label}</span>
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

      <div className="mt-1 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-dt-ink-3">
        <Legend swatch="border-dt-line-strong bg-dt-surface" label="Free" />
        <Legend swatch="border-transparent bg-dt-ink" label="Yours" />
        <Legend swatch="border-dt-held bg-dt-held-soft" label="Someone is choosing" />
        <Legend swatch="border-transparent bg-dt-taken" label="Taken" />
      </div>
    </div>
  );
}
