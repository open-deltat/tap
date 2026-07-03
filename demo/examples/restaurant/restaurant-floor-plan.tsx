"use client";

import { cn } from "@/lib/utils";

export interface FloorTable {
  id: string;
  name: string;
  section: string;
  maxGuests: number;
  available: boolean;
}

export interface FloorBar {
  id: string;
  name: string;
  capacity: number;
  remaining: number;
}

interface FloorPlanProps {
  tables: FloorTable[];
  bar: FloorBar | null;
  selectedTableId: string | null;
  barSelected: boolean;
  onSelectTable: (id: string) => void;
  onSelectBar: () => void;
}

const SECTION_ORDER = ["Patio", "Dining Room", "Private Room"];

export function RestaurantFloorPlan({
  tables,
  bar,
  selectedTableId,
  barSelected,
  onSelectTable,
  onSelectBar,
}: FloorPlanProps) {
  const bySection = new Map<string, FloorTable[]>();
  for (const t of tables) {
    const list = bySection.get(t.section) ?? [];
    list.push(t);
    bySection.set(t.section, list);
  }
  const sectionNames = Array.from(bySection.keys()).sort(
    (a, b) => SECTION_ORDER.indexOf(a) - SECTION_ORDER.indexOf(b)
  );

  return (
    <div className="space-y-6">
      {sectionNames.map((sectionName) => {
        const sectionTables = bySection.get(sectionName) ?? [];
        return (
          <div key={sectionName}>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
              {sectionName}
            </h3>
            <div className="flex flex-wrap gap-3">
              {sectionTables.map((table) => {
                const selected = selectedTableId === table.id;
                return (
                  <button
                    key={table.id}
                    disabled={!table.available}
                    onClick={() => onSelectTable(table.id)}
                    className={cn(
                      "min-w-[84px] rounded-lg border p-3 text-center transition-all",
                      table.available
                        ? selected
                          ? "border-emerald-400 bg-emerald-500/15 text-zinc-100 ring-2 ring-emerald-500/30"
                          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-emerald-500/40 hover:bg-white/[0.06]"
                        : "cursor-not-allowed border-white/5 bg-white/[0.015] text-zinc-600"
                    )}
                  >
                    <div className="text-sm font-semibold">{table.name}</div>
                    <div className="mt-0.5 text-[10px] text-zinc-500">{table.maxGuests} guests</div>
                    {/* Always rendered so available and unavailable tiles are the same height. */}
                    <div className={cn("mt-0.5 text-[10px] font-medium text-rose-400/80", table.available && "invisible")}>
                      unavailable
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {bar && (
        <div>
          <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Bar · capacity {bar.capacity}
          </h3>
          <button
            disabled={bar.remaining <= 0}
            onClick={onSelectBar}
            className={cn(
              "w-full rounded-lg border p-4 text-left transition-all",
              bar.remaining <= 0
                ? "cursor-not-allowed border-white/5 bg-white/[0.015] text-zinc-600"
                : barSelected
                  ? "border-emerald-400 bg-emerald-500/15 ring-2 ring-emerald-500/30"
                  : "border-white/10 bg-white/[0.03] hover:border-emerald-500/40 hover:bg-white/[0.06]"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-zinc-100">{bar.name}</span>
              <span
                className={cn(
                  "text-xs font-medium",
                  bar.remaining <= 0 ? "text-rose-400/80" : "text-emerald-300"
                )}
              >
                {bar.remaining} of {bar.capacity} free
              </span>
            </div>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: bar.capacity }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-2 flex-1 rounded-full",
                    i < bar.remaining ? "bg-emerald-500/70" : "bg-white/10"
                  )}
                />
              ))}
            </div>
            <div className="mt-2 text-[10px] text-zinc-500">
              Walk-up seats · book a party in one atomic batch
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
