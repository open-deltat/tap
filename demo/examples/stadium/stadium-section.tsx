"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatTime } from "@/lib/time";

const MAX_CELLS = 240; // huge sections render a representative window, not 80k cells
const MAX_PICK = 8;

export interface SeatGridSection {
  id: string;
  name: string;
  tier: string;
  capacity: number;
  remaining: number;
  price: number;
}

/**
 * Drill-in seat grid for ONE capacity-N pool section. The pool's capacity is the only
 * source of truth — there are no per-seat resources. We render `taken = capacity - remaining`
 * greyed cells (modelled as the FIRST cells so the free block stays visually contiguous and
 * clickable), then the free cells. Picking K free cells and confirming books K units atomically
 * against the pool, which is exactly how deltat's capacity sweep treats them: fungible.
 */
export function StadiumSection({
  section,
  slot,
  isPending,
  onBack,
  onBook,
}: {
  section: SeatGridSection;
  slot: { start: number; end: number };
  isPending: boolean;
  onBack: () => void;
  onBook: (count: number) => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const { rendered, cols, takenRendered } = useMemo(() => {
    if (section.capacity <= 0) return { rendered: 0, cols: 8, takenRendered: 0 };
    const rendered = Math.min(section.capacity, MAX_CELLS);
    // Scale the greyed count to the rendered window so the free/taken ratio reads true even
    // when we only show a slice of a 1,400-seat pool.
    const takenRendered = Math.round((1 - section.remaining / section.capacity) * rendered);
    const cols = Math.min(24, Math.max(8, Math.ceil(Math.sqrt(rendered) * 1.6)));
    return { rendered, cols, takenRendered };
  }, [section.capacity, section.remaining]);

  // Cap the live pick at what the pool can actually take right now.
  const pickCap = Math.min(MAX_PICK, section.remaining);
  const count = picked.size;

  function toggle(i: number) {
    if (i < takenRendered) return; // greyed / taken
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) {
        next.delete(i);
      } else if (next.size < pickCap) {
        next.add(i);
      }
      return next;
    });
  }

  return (
    <div className="flex flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-zinc-300 hover:text-zinc-100"
          onClick={onBack}
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Bowl
        </Button>
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-100">
            {section.tier} · {section.name}
          </div>
          <div className="text-xs text-zinc-400">
            {section.remaining.toLocaleString()} of {section.capacity.toLocaleString()} open ·{" "}
            {formatTime(slot.start)} – {formatTime(slot.end)}
            {section.price > 0 && ` · $${section.price}/seat`}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#08080a] p-4">
        <div
          className="grid justify-center gap-1"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rendered }, (_, i) => {
            const taken = i < takenRendered;
            const isPicked = picked.has(i);
            return (
              <button
                key={i}
                type="button"
                disabled={taken}
                onClick={() => toggle(i)}
                aria-label={taken ? "taken" : isPicked ? "selected" : "free"}
                className={cn(
                  "aspect-square w-full rounded-[3px] transition-colors",
                  taken
                    ? "cursor-not-allowed bg-zinc-800"
                    : isPicked
                      ? "cursor-pointer bg-emerald-500 ring-1 ring-emerald-300"
                      : "cursor-pointer bg-emerald-500/25 hover:bg-emerald-500/50"
                )}
              />
            );
          })}
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
          <Legend className="bg-emerald-500/25" label="free" />
          <Legend className="bg-emerald-500" label="picked" />
          <Legend className="bg-zinc-800" label="taken" />
          {section.capacity > rendered && (
            <span className="text-zinc-600">
              showing {rendered} of {section.capacity.toLocaleString()}
            </span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-3">
        <span className="text-sm text-zinc-300">
          {count > 0 ? `${count} picked` : "Pick free seats above"}
        </span>
        <Button
          onClick={() => onBook(count)}
          disabled={count === 0 || isPending}
          className="bg-emerald-500 text-white hover:bg-emerald-400"
        >
          {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Book {count > 0 ? count : ""}
          {section.price > 0 && count > 0 && ` · $${(count * section.price).toLocaleString()}`}
        </Button>
      </div>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
}
