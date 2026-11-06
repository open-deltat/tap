"use client";

import { cn } from "@open-deltat/shared/utils";

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
            <h3 className="mb-2.5 text-[13px] font-medium text-dt-ink-3">
              {sectionName}
            </h3>
            <div className="flex flex-wrap gap-2.5">
              {sectionTables.map((table) => {
                const selected = selectedTableId === table.id;
                return (
                  <button
                    key={table.id}
                    disabled={!table.available}
                    onClick={() => onSelectTable(table.id)}
                    className={cn(
                      "min-w-[88px] rounded-2xl border p-3 text-center transition-[background-color,border-color,color,transform] duration-150 active:scale-[0.97]",
                      table.available
                        ? selected
                          ? "border-transparent bg-dt-ink text-dt-on-ink"
                          : "border-dt-line-strong bg-dt-surface text-dt-ink hover:border-dt-ink"
                        : "cursor-not-allowed border-transparent bg-dt-taken text-dt-ink-3"
                    )}
                  >
                    <div className="text-sm font-semibold">{table.name}</div>
                    <div className={cn("mt-0.5 text-[11px] tabular-nums", selected && table.available ? "text-dt-on-ink/70" : "text-dt-ink-3")}>
                      {table.maxGuests} guests
                    </div>
                    {/* Always rendered so available and unavailable tiles are the same height. */}
                    <div className={cn("mt-0.5 text-[11px] font-medium text-dt-ink-3", table.available && "invisible")}>
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
          <h3 className="mb-2.5 text-[13px] font-medium tabular-nums text-dt-ink-3">
            Bar · capacity {bar.capacity}
          </h3>
          <button
            disabled={bar.remaining <= 0}
            onClick={onSelectBar}
            className={cn(
              "w-full rounded-2xl border p-4 text-left transition-[background-color,border-color,transform] duration-150 active:scale-[0.99]",
              bar.remaining <= 0
                ? "cursor-not-allowed border-transparent bg-dt-taken text-dt-ink-3"
                : barSelected
                  ? "border-dt-ink bg-dt-surface ring-1 ring-dt-ink"
                  : "border-dt-line-strong bg-dt-surface hover:border-dt-ink"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-dt-ink">{bar.name}</span>
              <span
                className={cn(
                  "text-xs font-medium tabular-nums",
                  bar.remaining <= 0 ? "text-dt-ink-3" : "text-dt-accent-ink"
                )}
              >
                {bar.remaining} of {bar.capacity} free
              </span>
            </div>
            <div className="mt-2.5 flex gap-1">
              {Array.from({ length: bar.capacity }, (_, i) => (
                <span
                  key={i}
                  className={cn(
                    "h-1.5 flex-1 rounded-full",
                    i < bar.remaining ? "bg-dt-accent" : "bg-dt-taken"
                  )}
                />
              ))}
            </div>
          </button>
        </div>
      )}
    </div>
  );
}
