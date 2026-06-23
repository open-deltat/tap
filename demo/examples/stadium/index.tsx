"use client";

import { useEffect, useState, useCallback, useTransition, useRef, useMemo } from "react";
import { toast } from "sonner";
import { Loader2, ZoomIn, ZoomOut, Maximize, Locate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import { toLocalDateString, formatTime } from "@/lib/time";
import { useWebSocket } from "@/hooks/use-websocket";

import { seedStadium } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, batchBookSlots } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";

import { StadiumCanvas, LEGEND_COLORS, type CanvasSection, type CanvasHit } from "./stadium-canvas";
import {
  WORLD,
  SEAT_THRESHOLD,
  SEAT_LEVEL,
  type Transform,
  zoomLevels,
  transformCenteredOn,
  sectionFrame,
  sectionCols,
  seatId,
  cellFromSeatId,
  nearestLevel,
  levelName,
} from "./geometry";

const MAX_QTY = 8;

interface Section extends CanvasSection {
  res: Resource;
  price: number;
  tier: string;
}

// Booking labels carry the exact seat after this marker, e.g. "Lower Bowl · Sec 305 · Seat B5".
const SEAT_MARKER = " · Seat ";

// Recover which exact cells are booked from their booking labels. Falls back to a deterministic
// first-N when a booking lacks a parseable seat (premium boxes, legacy, or a duplicate cell),
// so the count of dark cells always equals the number of bookings.
function computeTakenCells(bookings: Booking[], cols: number, capacity: number): Set<number> {
  const taken = Math.min(bookings.length, capacity);
  const cells = new Set<number>();
  for (const b of bookings) {
    const label = b.label ?? "";
    const at = label.lastIndexOf(SEAT_MARKER);
    const cell = at >= 0 ? cellFromSeatId(label.slice(at + SEAT_MARKER.length), cols) : null;
    if (cell != null && cell >= 0 && cell < capacity) cells.add(cell);
  }
  if (cells.size !== taken) {
    cells.clear();
    for (let i = 0; i < taken; i++) cells.add(i);
  }
  return cells;
}

// Fallback canvas size before the host element has measured (first render / SSR).
const FALLBACK_VIEW = { w: 900, h: 520 };

// Read the live canvas size; fall back to a sensible default if unmeasured.
function canvasSize(): { w: number; h: number } {
  const el = typeof document !== "undefined" ? document.getElementById("stadium-canvas-host") : null;
  return {
    w: el?.clientWidth || FALLBACK_VIEW.w,
    h: el?.clientHeight || FALLBACK_VIEW.h,
  };
}

export default function StadiumExample() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [date] = useState(toLocalDateString(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);

  const [bookingsBySection, setBookingsBySection] = useState<Map<string, Booking[]>>(new Map());
  // The stadium root id. Bookings on any section bubble up to it (event bubbling), so one
  // subscription here streams every section's changes — the basis for live seat-flips.
  const [rootId, setRootId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedCells, setSelectedCells] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<BookingResult | null>(null);

  // Discrete zoom: a level index into the ladder, not a free scale.
  const [transform, setTransform] = useState<Transform>(() => {
    const levels = zoomLevels(FALLBACK_VIEW.w, FALLBACK_VIEW.h);
    return transformCenteredOn(levels[0], WORLD.w / 2, WORLD.h / 2, FALLBACK_VIEW.w, FALLBACK_VIEW.h);
  });
  const easeRef = useRef<number>(0);
  // The ladder level we're currently easing toward (null when idle). Stepping is always
  // computed relative to this when set, so a fast wheel reversal mid-ease can't read an
  // intermediate interpolated scale and get stuck.
  const targetLevelRef = useRef<number | null>(null);

  // Memoized on the data only (not transform), so panning/zooming doesn't re-parse seat labels
  // or hand the canvas a new array every frame.
  const sections: Section[] = useMemo(
    () =>
      resources
        .filter((r) => r.section != null)
        .map((r) => {
          const layout = r.section!;
          const bks = bookingsBySection.get(r.id) ?? [];
          const cols = sectionCols(layout.ring, layout.idx, layout.ringCount, layout.assigned, r.capacity);
          const taken = bks.length;
          return {
            id: r.id,
            name: r.name ?? "",
            res: r,
            price: r.price ?? 0,
            tier: layout.tier,
            capacity: r.capacity,
            remaining: Math.max(0, r.capacity - taken),
            takenCells: computeTakenCells(bks, cols, r.capacity),
            ring: layout.ring,
            idx: layout.idx,
            ringCount: layout.ringCount,
            assigned: layout.assigned,
          };
        }),
    [resources, bookingsBySection]
  );

  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const totalCapacity = sections.reduce((n, s) => n + s.capacity, 0);
  const totalRemaining = sections.reduce((n, s) => n + s.remaining, 0);

  const loadBookings = useCallback(async (sectionIds: string[], start: number, end: number) => {
    if (sectionIds.length === 0) return;
    const map = await getMultiResourceBookings(sectionIds);
    const filtered = new Map<string, Booking[]>();
    for (const [id, bks] of Object.entries(map)) {
      filtered.set(id, (bks as Booking[]).filter((b) => b.start < end && b.end > start));
    }
    setBookingsBySection(filtered);
  }, []);

  // Seed + initial load.
  useEffect(() => {
    (async () => {
      try {
        const [id] = await seedStadium();
        setRootId(id);
        const all = await getResources();
        setResources(all);
        const dayStart = new Date(`${date}T00:00`).getTime();
        const daySlots = await getAvailability(id, dayStart, dayStart + 86_400_000);
        setSlots(daySlots);
        if (daySlots.length) setSlot({ start: daySlots[0].start, end: daySlots[0].end });
      } catch {
        toast.error("Failed to connect to Δt. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once the canvas is mounted and measured, snap the overview (L0) to the real size so the
  // whole stadium fits — the initial state used fallback dims before the host existed.
  useEffect(() => {
    if (loading) return;
    const { w, h } = canvasSize();
    const levels = zoomLevels(w, h);
    setTransform(transformCenteredOn(levels[0], WORLD.w / 2, WORLD.h / 2, w, h));
  }, [loading]);

  // Per-section remaining for the chosen slot.
  useEffect(() => {
    if (!slot) return;
    const ids = resources.filter((r) => r.section != null).map((r) => r.id);
    loadBookings(ids, slot.start, slot.end);
    setSelectedId(null);
    setSelectedCells(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, resources]);

  // Ease the transform toward a target over ~250ms with easeInOutCubic.
  const easeTo = useCallback((target: Transform) => {
    cancelAnimationFrame(easeRef.current);
    const start = performance.now();
    const from = transform;
    const dur = 250;
    const easeInOutCubic = (k: number) =>
      k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / dur);
      const e = easeInOutCubic(k);
      setTransform({
        scale: from.scale + (target.scale - from.scale) * e,
        offsetX: from.offsetX + (target.offsetX - from.offsetX) * e,
        offsetY: from.offsetY + (target.offsetY - from.offsetY) * e,
      });
      if (k < 1) easeRef.current = requestAnimationFrame(step);
      else targetLevelRef.current = null;
    };
    easeRef.current = requestAnimationFrame(step);
  }, [transform]);

  useEffect(() => () => cancelAnimationFrame(easeRef.current), []);

  // Current ladder level. Always derived from the live scale (so panning, which never
  // touches scale, can't desync it). While an ease is in flight we trust the target it's
  // heading to, so a fast wheel reversal steps relative to the destination, not a midpoint.
  const currentLevel = useCallback((levels: number[]) => {
    return targetLevelRef.current ?? nearestLevel(levels, transform.scale);
  }, [transform.scale]);

  // Ease to a discrete ladder level, keeping a world focus point at the canvas center.
  // Default focus is whatever's currently centered, so wheel/buttons zoom toward center.
  const goToLevel = useCallback(
    (level: number, focus?: { x: number; y: number }) => {
      const { w, h } = canvasSize();
      const levels = zoomLevels(w, h);
      const clamped = Math.max(0, Math.min(levels.length - 1, level));
      targetLevelRef.current = clamped;
      const scale = levels[clamped];
      const fx = focus?.x ?? (w / 2 - transform.offsetX) / transform.scale;
      const fy = focus?.y ?? (h / 2 - transform.offsetY) / transform.scale;
      easeTo(transformCenteredOn(scale, fx, fy, w, h));
    },
    [easeTo, transform]
  );

  // Wheel step: move exactly one ladder level toward the cursor. Clamped to [0..3] and
  // always reversible — wheel-out from any level/state steps back toward Overview.
  const onZoomStep = useCallback(
    (direction: 1 | -1, focusX: number, focusY: number) => {
      const { w, h } = canvasSize();
      const levels = zoomLevels(w, h);
      const current = currentLevel(levels);
      const next = Math.max(0, Math.min(levels.length - 1, current + direction));
      if (next === current) return;
      goToLevel(next, { x: focusX, y: focusY });
    },
    [goToLevel, currentLevel]
  );

  const onHit = useCallback(
    (hit: CanvasHit) => {
      // Zoomed in: toggle a free seat cell in the selection set. Clicks never change zoom.
      const s = hit.section;
      if (s.takenCells.has(hit.cell)) return; // already booked
      setSelectedId(s.id);
      setSelectedCells((prev) => {
        // Switching sections resets the selection.
        const base = selectedId === s.id ? new Set(prev) : new Set<number>();
        if (base.has(hit.cell)) {
          base.delete(hit.cell);
          return base;
        }
        const cap = s.assigned ? 1 : Math.min(MAX_QTY, s.remaining);
        if (s.assigned) {
          const single = new Set<number>();
          single.add(hit.cell);
          return single;
        }
        if (base.size >= cap) return base;
        base.add(hit.cell);
        return base;
      });
    },
    [selectedId]
  );

  // Live seat-flips: any booking on any section bubbles to the root, so this one subscription
  // re-reads the current slot whenever anyone books. Debounced + ref-read so a burst (our own
  // batch, or several concurrent bookers) coalesces into one reload using the latest slot and
  // section list. Not gated on isPending: a full re-read is idempotent, so re-reading our own
  // just-booked change is harmless, and gating it would silently drop others' concurrent events.
  const slotRef = useRef(slot);
  slotRef.current = slot;
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  const reloadTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const liveReload = useCallback(() => {
    if (reloadTimerRef.current) clearTimeout(reloadTimerRef.current);
    reloadTimerRef.current = setTimeout(() => {
      const s = slotRef.current;
      if (!s) return;
      const ids = resourcesRef.current.filter((r) => r.section != null).map((r) => r.id);
      loadBookings(ids, s.start, s.end);
    }, 200);
  }, [loadBookings]);

  useEffect(() => () => clearTimeout(reloadTimerRef.current), []);

  useWebSocket(rootId ? { type: "subscribe", resourceId: rootId, onEvent: liveReload } : null);

  function book() {
    if (!selected || !slot) return;
    const sl = slot;
    const sec = selected;
    // One booking per chosen cell, each labelled with its exact seat so it renders back where it
    // was picked. A premium box is a single unit (cell 0) and needs no seat suffix.
    const cells = sec.assigned ? [0] : Array.from(selectedCells);
    const n = cells.length;
    if (n < 1) return;
    const cols = sectionCols(sec.ring, sec.idx, sec.ringCount, sec.assigned, sec.capacity);
    const rows = cells.map((cell) => ({
      resourceId: sec.res.id,
      start: sl.start,
      end: sl.end,
      label: sec.assigned
        ? `${sec.tier} · ${sec.res.name}`
        : `${sec.tier} · ${sec.res.name}${SEAT_MARKER}${seatId(cell, cols)}`,
    }));
    startTransition(async () => {
      try {
        const created = await batchBookSlots(rows);
        setResult({
          title: `${n} ticket${n > 1 ? "s" : ""} · ${sec.res.name}`,
          subtitle: `${sec.tier} · ${formatTime(sl.start)} – ${formatTime(sl.end)}`,
          bookings: created,
          resources: [sec.res],
        });
        setSelectedCells(new Set());
        const ids = resources.filter((r) => r.section != null).map((r) => r.id);
        await loadBookings(ids, sl.start, sl.end);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  // +/- buttons step one ladder level toward the canvas center. Same derivation as the
  // wheel, so the − button always steps out from any level/state.
  function stepZoom(direction: 1 | -1) {
    const { w, h } = canvasSize();
    const levels = zoomLevels(w, h);
    goToLevel(currentLevel(levels) + direction);
  }

  // Fly to the section with the most open seats and zoom to seat level, so a visitor lands
  // on bookable seats instead of hunting the bowl. goToLevel centers on the section frame.
  function findOpenSeats() {
    const open = sections.filter((s) => s.remaining > 0);
    if (open.length === 0) return;
    const best = open.reduce((a, b) => (b.remaining > a.remaining ? b : a));
    const f = sectionFrame(best.ring, best.idx, best.ringCount, best.assigned);
    setSelectedId(best.id);
    // A premium box is one assignable unit (cell 0): pre-select it so the canvas highlight
    // matches the "box selected" tray. GA sections land unselected — pick seats by tapping.
    setSelectedCells(best.assigned ? new Set([0]) : new Set());
    goToLevel(SEAT_LEVEL, { x: f.cx, y: f.cy });
  }

  // Escape hatch: ease back to the whole-stadium overview, recentered on the field. Passing an
  // explicit world-center focus (not a bare goToLevel(0)) recenters instead of only rescaling.
  function resetView() {
    setSelectedId(null);
    setSelectedCells(new Set());
    goToLevel(0, { x: WORLD.w / 2, y: WORLD.h / 2 });
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to Δt…
        </div>
      </div>
    );
  }

  const seatLOD = transform.scale >= SEAT_THRESHOLD;
  const { w: viewW, h: viewH } = canvasSize();
  const levelLabel = levelName(nearestLevel(zoomLevels(viewW, viewH), transform.scale));

  const ribbon = (
    <div className="flex flex-col items-center gap-2">
      {slots.length > 1 && (
        <div className="flex flex-wrap items-center justify-center gap-1.5">
          {slots.map((s, i) => {
            const active = slot?.start === s.start && slot?.end === s.end;
            return (
              <button
                key={i}
                onClick={() => setSlot({ start: s.start, end: s.end })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs transition-colors",
                  active
                    ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                    : "border-white/10 text-zinc-400 hover:text-zinc-200"
                )}
              >
                {formatTime(s.start)}
              </button>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-zinc-500">
        {totalRemaining.toLocaleString()} of {totalCapacity.toLocaleString()} seats open across{" "}
        {sections.length} sections
      </div>
      <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-zinc-500 sm:gap-x-4">
        <Legend color={LEGEND_COLORS.plenty} label="plenty" />
        <Legend color={LEGEND_COLORS.filling} label="filling" />
        <Legend color={LEGEND_COLORS.nearlyFull} label="nearly full" />
        <Legend color={LEGEND_COLORS.premium} label="premium box" />
        <Legend color={LEGEND_COLORS.soldOut} label="sold out" />
        <Legend color={LEGEND_COLORS.selection} label="holding (you)" />
      </div>
    </div>
  );

  const n = selected ? (selected.assigned ? 1 : selectedCells.size) : 0;
  const tray =
    selected && n > 0 ? (
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-100">
            {selected.tier} · {selected.res.name}
          </div>
          <div className="text-xs text-zinc-400">
            {n} {selected.assigned ? "box" : `seat${n > 1 ? "s" : ""}`} selected ·{" "}
            {selected.remaining.toLocaleString()} open
            {selected.price > 0 && ` · $${selected.price}/seat`}
          </div>
        </div>
        <Button onClick={book} disabled={isPending} className="h-10 px-6 text-sm font-semibold bg-emerald-500 text-white shadow-lg shadow-emerald-500/25 hover:bg-emerald-400">
          {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Book {n}
          {selected.price > 0 && ` · $${(n * selected.price).toLocaleString()}`}
        </Button>
      </div>
    ) : undefined;

  return (
    <>
      <Stage
        primitive={{ label: "Find open seats in a huge crowd", specId: "AVAIL-06" }}
        title="Olympia Stadium"
        ribbon={ribbon}
        tray={tray}
      >
        <div id="stadium-canvas-host" className="relative">
          <StadiumCanvas
            sections={sections}
            transform={transform}
            selectedSectionId={selectedId}
            selectedCells={selectedCells}
            onTransformChange={setTransform}
            onZoomStep={onZoomStep}
            onHit={onHit}
          />

          {/* Find open seats: jump straight to the emptiest section + zoom to its seats. */}
          <div className="pointer-events-none absolute left-3 top-3">
            <button
              type="button"
              onClick={findOpenSeats}
              disabled={totalRemaining === 0}
              className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[12px] font-medium text-emerald-200 shadow-sm backdrop-blur-sm transition-colors hover:bg-emerald-400/20 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Locate className="h-3.5 w-3.5" />
              Find open seats
            </button>
          </div>

          {/* Zoom control pinned bottom-right: current-level label above reset + a vertical +/- stack. */}
          <div className="pointer-events-none absolute bottom-3 right-3 flex flex-col items-end gap-1.5">
            <span className="rounded-md border border-white/15 bg-zinc-900/80 px-2 py-0.5 text-[11px] font-medium text-zinc-200 shadow-sm backdrop-blur-sm">
              {levelLabel}
            </span>
            <div className="pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-white/15 bg-zinc-900/80 shadow-md backdrop-blur-sm">
              <button
                type="button"
                onClick={resetView}
                aria-label="Reset view to the whole stadium"
                className="flex h-9 w-9 items-center justify-center text-zinc-200 transition-colors hover:bg-white/10 active:bg-white/20"
              >
                <Maximize className="h-4 w-4" />
              </button>
              <div className="h-px w-full bg-white/10" />
              <button
                type="button"
                onClick={() => stepZoom(1)}
                aria-label="Zoom in one level"
                className="flex h-9 w-9 items-center justify-center text-zinc-200 transition-colors hover:bg-white/10 active:bg-white/20"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <div className="h-px w-full bg-white/10" />
              <button
                type="button"
                onClick={() => stepZoom(-1)}
                aria-label="Zoom out one level"
                className="flex h-9 w-9 items-center justify-center text-zinc-200 transition-colors hover:bg-white/10 active:bg-white/20"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="pointer-events-none absolute bottom-3 left-3 text-[11px] text-zinc-500/80">
            <span className="hidden sm:inline">scroll to zoom · drag to pan</span>
            <span className="sm:hidden">pinch to zoom · drag to pan</span>
          </div>

          {seatLOD && (
            <div className="pointer-events-none mt-2 text-center text-[11px] text-zinc-600">
              Tap a free seat to select · book the batch below
            </div>
          )}
        </div>
      </Stage>

      <BookingConfirmedModal
        result={result}
        onClose={() => setResult(null)}
        onBookAnother={() => setResult(null)}
      />

      {isPending && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="flex items-center gap-2 text-sm text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Working…
          </div>
        </div>
      )}
    </>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
