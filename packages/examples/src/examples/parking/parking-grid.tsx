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

function ratioClasses(z: ZoneTile): { dot: string; text: string } {
  const ratio = z.remaining / z.capacity;
  if (ratio > 0.5) return { dot: "bg-emerald-500", text: "text-emerald-300" };
  if (ratio > 0.15) return { dot: "bg-amber-500", text: "text-amber-300" };
  return { dot: "bg-rose-500", text: "text-rose-300" };
}

export function ParkingGrid({ floors, selectedId, onSelect }: ParkingGridProps) {
  return (
    <div className="space-y-6">
      {floors.map((floor) => (
        <div key={floor.name}>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              {floor.name}
            </h3>
            <span className="font-mono text-[10px] text-zinc-600">
              {floor.zones.reduce((n, z) => n + z.remaining, 0)} free
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {floor.zones.map((z) => {
              const unavailable = z.closed || z.remaining <= 0;
              const selected = z.id === selectedId;
              const c = ratioClasses(z);
              return (
                <button
                  key={z.id}
                  disabled={unavailable}
                  onClick={() => onSelect(z.id)}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-4 text-left transition-all",
                    selected
                      ? "border-emerald-400/60 bg-emerald-400/10 ring-2 ring-emerald-400/30"
                      : unavailable
                        ? "cursor-not-allowed border-white/5 bg-white/[0.01] opacity-50"
                        : "border-white/10 bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-zinc-100">{z.name}</span>
                    {!unavailable && <span className={cn("h-2 w-2 rounded-full", c.dot)} />}
                  </div>

                  {z.closed ? (
                    <span className="text-xs font-medium text-zinc-500">Closed · maintenance</span>
                  ) : z.remaining <= 0 ? (
                    <span className="text-xs font-medium text-rose-300">Full · 0 of {z.capacity}</span>
                  ) : (
                    <span className={cn("text-xs font-medium", c.text)}>
                      {z.remaining} of {z.capacity} free
                    </span>
                  )}

                  <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className={cn("h-full rounded-full", unavailable ? "bg-zinc-700" : c.dot)}
                      style={{ width: `${unavailable ? 100 : (1 - z.remaining / z.capacity) * 100}%` }}
                    />
                  </div>

                  <span className="text-[10px] text-zinc-600">${z.price}/hr</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
