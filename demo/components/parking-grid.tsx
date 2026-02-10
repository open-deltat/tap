"use client";

import { cn } from "@/lib/utils";

interface Spot {
  id: string;
  name: string;
  zone: string;
}

interface ParkingGridProps {
  spots: Spot[];
  availableIds: Set<string>;
  bookedIds: Set<string>;
  heldIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const ZONE_COLORS: Record<string, string> = {
  A: "bg-blue-500",
  B: "bg-emerald-500",
  C: "bg-violet-500",
  D: "bg-amber-500",
  E: "bg-rose-500",
  F: "bg-cyan-500",
  G: "bg-indigo-500",
  H: "bg-orange-500",
};

export function ParkingGrid({ spots, availableIds, bookedIds, heldIds, selectedId, onSelect }: ParkingGridProps) {
  const zones = new Map<string, Spot[]>();
  for (const spot of spots) {
    const list = zones.get(spot.zone) ?? [];
    list.push(spot);
    zones.set(spot.zone, list);
  }

  const totalSpots = spots.length;
  const availableCount = availableIds.size;
  const occupiedCount = bookedIds.size;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 text-xs">
        <span className="text-muted-foreground">{totalSpots} total</span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> {availableCount} available
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> {occupiedCount} occupied
        </span>
        {heldIds.size > 0 && (
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> {heldIds.size} held
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Array.from(zones).map(([zoneName, zoneSpots]) => {
          const color = ZONE_COLORS[zoneName] ?? "bg-gray-500";
          return (
            <div key={zoneName} className="rounded-lg border p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("h-3 w-3 rounded-sm", color)} />
                <span className="text-xs font-medium">Zone {zoneName}</span>
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {zoneSpots.filter((s) => availableIds.has(s.id)).length}/{zoneSpots.length}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {zoneSpots.map((spot) => {
                  const available = availableIds.has(spot.id);
                  const booked = bookedIds.has(spot.id);
                  const held = heldIds.has(spot.id);
                  const selected = selectedId === spot.id;

                  return (
                    <button
                      key={spot.id}
                      disabled={!available}
                      onClick={() => onSelect(spot.id)}
                      className={cn(
                        "aspect-square rounded-md border text-[10px] font-medium transition-all flex items-center justify-center",
                        selected
                          ? "border-primary bg-primary text-primary-foreground ring-2 ring-primary/20"
                          : available
                            ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800"
                            : held
                              ? "border-amber-300 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 dark:border-amber-800 cursor-not-allowed"
                              : booked
                                ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 dark:border-red-800 cursor-not-allowed"
                                : "border-muted bg-muted/30 text-muted-foreground/50 cursor-not-allowed"
                      )}
                    >
                      {spot.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
