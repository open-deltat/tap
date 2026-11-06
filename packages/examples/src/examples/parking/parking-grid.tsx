"use client";

import { cn } from "@open-deltat/shared/utils";

export interface ZoneTile {
  id: string;
  name: string;
  floorName: string;
  capacity: number;
  remaining: number;
  price: number;
  closed: boolean; // blocked by a maintenance rule for the selected window
}

interface ParkingGridProps {
  floors: { name: string; zones: ZoneTile[] }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// How much is left is one hue fading out, the same ramp as the stadium, with the count always
// written beside it. Amber stays reserved for "someone else is holding it"; no red, because a zone
// that is almost gone is still a zone you can take.
function ratioClasses(z: ZoneTile): { dot: string; text: string } {
  const ratio = z.remaining / z.capacity;
  if (ratio > 0.5) return { dot: "bg-dt-accent", text: "text-dt-accent-ink" };
  if (ratio > 0.15) return { dot: "bg-dt-ramp-2", text: "text-dt-ink-2" };
  return { dot: "bg-dt-ramp-3 ring-1 ring-dt-ramp-2", text: "text-dt-ink-3" };
}

export function ParkingGrid({ floors, selectedId, onSelect }: ParkingGridProps) {
  return (
    <div className="space-y-6">
      {floors.map((floor) => (
        <div key={floor.name}>
          <div className="mb-2.5 flex items-center justify-between">
            <h3 className="text-[13px] font-medium text-dt-ink-2">
              {floor.name}
            </h3>
            <span className="text-[12px] tabular-nums text-dt-ink-3">
              {floor.zones.reduce((n, z) => n + z.remaining, 0)} free
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {floor.zones.map((z) => {
              const unavailable = z.closed || z.remaining <= 0;
              const selected = z.id === selectedId;
              const c = ratioClasses(z);
              return (
                <button
                  key={z.id}
                  disabled={unavailable}
                  onClick={() => onSelect(z.id)}
                  aria-pressed={selected}
                  className={cn(
                    "flex flex-col gap-2 rounded-2xl border p-4 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.98]",
                    selected
                      ? "border-dt-ink bg-dt-surface ring-1 ring-dt-ink"
                      : unavailable
                        ? "cursor-not-allowed border-transparent bg-dt-taken"
                        : "border-dt-line-strong bg-dt-surface hover:border-dt-ink"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className={cn("text-sm font-semibold", unavailable ? "text-dt-ink-3" : "text-dt-ink")}>{z.name}</span>
                    {!unavailable && <span className={cn("h-2 w-2 rounded-full", c.dot)} />}
                  </div>

                  {z.closed ? (
                    <span className="text-xs font-medium text-dt-ink-3">Closed · maintenance</span>
                  ) : z.remaining <= 0 ? (
                    <span className="text-xs font-medium tabular-nums text-dt-ink-3">Full · 0 of {z.capacity}</span>
                  ) : (
                    <span className={cn("text-xs font-medium tabular-nums", c.text)}>
                      {z.remaining} of {z.capacity} free
                    </span>
                  )}

                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-dt-taken">
                    <div
                      className={cn("h-full rounded-full", unavailable ? "bg-dt-ink-3/30" : c.dot)}
                      style={{ width: `${unavailable ? 100 : (1 - z.remaining / z.capacity) * 100}%` }}
                    />
                  </div>

                  <span className="text-[11px] tabular-nums text-dt-ink-3">${z.price}/hr</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
