"use client";

import { cn } from "@/lib/utils";

interface Table {
  id: string;
  name: string;
  section: string;
  maxGuests: number;
}

interface FloorPlanProps {
  tables: Table[];
  availableIds: Set<string>;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const SECTION_COLORS: Record<string, { bg: string; border: string; activeBg: string }> = {
  Patio: { bg: "bg-emerald-50 dark:bg-emerald-950/30", border: "border-emerald-200 dark:border-emerald-800", activeBg: "bg-emerald-100 dark:bg-emerald-900/50" },
  "Dining Room": { bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-blue-200 dark:border-blue-800", activeBg: "bg-blue-100 dark:bg-blue-900/50" },
  "Private Room": { bg: "bg-purple-50 dark:bg-purple-950/30", border: "border-purple-200 dark:border-purple-800", activeBg: "bg-purple-100 dark:bg-purple-900/50" },
};

export function RestaurantFloorPlan({ tables, availableIds, selectedId, onSelect }: FloorPlanProps) {
  const sections = new Map<string, Table[]>();
  for (const t of tables) {
    const list = sections.get(t.section) ?? [];
    list.push(t);
    sections.set(t.section, list);
  }

  return (
    <div className="space-y-6">
      {Array.from(sections).map(([sectionName, sectionTables]) => {
        const colors = SECTION_COLORS[sectionName] ?? SECTION_COLORS["Dining Room"];
        return (
          <div key={sectionName}>
            <h3 className="text-xs font-medium text-muted-foreground mb-2">{sectionName}</h3>
            <div className="flex flex-wrap gap-3">
              {sectionTables.map((table) => {
                const available = availableIds.has(table.id);
                const selected = selectedId === table.id;
                return (
                  <button
                    key={table.id}
                    disabled={!available}
                    onClick={() => onSelect(table.id)}
                    className={cn(
                      "rounded-lg border-2 p-3 min-w-[80px] text-center transition-all",
                      available
                        ? selected
                          ? `${colors.activeBg} border-primary ring-2 ring-primary/20`
                          : `${colors.bg} ${colors.border} hover:ring-2 hover:ring-primary/10`
                        : "bg-muted/30 border-muted text-muted-foreground/50 cursor-not-allowed"
                    )}
                  >
                    <div className="text-sm font-semibold">{table.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      {table.maxGuests} guests
                    </div>
                    {!available && (
                      <div className="text-[10px] text-red-500 mt-0.5">Taken</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
