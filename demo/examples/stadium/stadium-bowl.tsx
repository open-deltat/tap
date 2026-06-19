"use client";

import { useEffect, useState, useCallback, useTransition, useRef } from "react";
import { toast } from "sonner";
import { Loader2, Minus, Plus, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Stage } from "@/components/stage";
import { BookingConfirmedModal, type BookingResult } from "@/components/booking-confirmed-modal";
import { StadiumSection } from "./stadium-section";
import type { Resource, AvailabilitySlot, Booking } from "@/lib/schemas";
import { toLocalDateString, formatTime } from "@/lib/time";

import { seedStadium } from "./seed";
import { getResources } from "@/app/actions/resources";
import { getAvailability } from "@/app/actions/availability";
import { getMultiResourceBookings, batchBookSlots } from "@/app/actions/bookings";
import { formatError } from "@/lib/format-error";

const MAX_QTY = 8;
const ZOOM_DRILL_THRESHOLD = 2.6; // zooming a selected pool section past this drills into seats

// Concentric oval geometry. Ring index → band radii; sections are placed by angle around it.
const FIELD = { cx: 400, cy: 300, rx: 120, ry: 72 };
function ringRadii(ring: number) {
  return { rx: 168 + ring * 70, ry: 116 + ring * 55 };
}

interface Section {
  res: Resource;
  capacity: number;
  price: number;
  remaining: number;
  ring: number;
  idx: number;
  ringCount: number;
  tier: string;
  assigned: boolean;
}

function fillFor(s: Section): string {
  if (s.remaining <= 0) return "#27272a"; // sold out (zinc-800)
  if (s.assigned) return "#d4a843"; // premium box — gold
  const ratio = s.remaining / s.capacity;
  if (ratio > 0.5) return "#10b981"; // emerald
  if (ratio > 0.15) return "#f59e0b"; // amber
  return "#fb7185"; // rose — nearly full
}

export function StadiumBowl() {
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();

  const [stadiumId, setStadiumId] = useState<string | null>(null);
  const [date] = useState(toLocalDateString(new Date()));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slot, setSlot] = useState<{ start: number; end: number } | null>(null);

  const [bookingsBySection, setBookingsBySection] = useState<Map<string, Booking[]>>(new Map());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoomedId, setZoomedId] = useState<string | null>(null);
  const [qty, setQty] = useState(2);
  const [result, setResult] = useState<BookingResult | null>(null);

  // Zoom / pan
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);

  const sections: Section[] = resources
    .filter((r) => r.section != null)
    .map((r) => {
      const layout = r.section!;
      const taken = (bookingsBySection.get(r.id) ?? []).length;
      return {
        res: r,
        capacity: r.capacity,
        price: r.price ?? 0,
        remaining: Math.max(0, r.capacity - taken),
        ring: layout.ring,
        idx: layout.idx,
        ringCount: layout.ringCount,
        tier: layout.tier,
        assigned: layout.assigned,
      };
    });

  const selected = sections.find((s) => s.res.id === selectedId) ?? null;
  const zoomed = sections.find((s) => s.res.id === zoomedId) ?? null;
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

  // Seed + initial load
  useEffect(() => {
    (async () => {
      try {
        const [id] = await seedStadium();
        const all = await getResources();
        setResources(all);
        setStadiumId(id);
        const dayStart = new Date(`${date}T00:00`).getTime();
        const daySlots = await getAvailability(id, dayStart, dayStart + 86_400_000);
        setSlots(daySlots);
        if (daySlots.length) setSlot({ start: daySlots[0].start, end: daySlots[0].end });
      } catch {
        toast.error("Failed to connect to deltat. Is it running?");
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload section bookings when the chosen event changes
  useEffect(() => {
    if (!slot) return;
    const ids = resources.filter((r) => r.section != null).map((r) => r.id);
    loadBookings(ids, slot.start, slot.end);
    setSelectedId(null);
    setZoomedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, resources]);

  function pick(s: Section) {
    if (s.remaining <= 0) return;
    setSelectedId(s.res.id);
    setQty(s.assigned ? 1 : Math.min(2, s.remaining));
    // Premium boxes (capacity-1) book outright from the tray; pool sections drill into a seat grid.
    if (!s.assigned) setZoomedId(s.res.id);
  }

  // Zooming past the threshold with a pool section selected drills into its seat grid.
  useEffect(() => {
    if (zoomedId || !selected || selected.assigned) return;
    if (view.scale >= ZOOM_DRILL_THRESHOLD) setZoomedId(selected.res.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.scale, selectedId, zoomedId]);

  // One atomic batch of N units against a single pool (or 1 unit for a premium box). The pool's
  // capacity sweep treats the rows as fungible — N units on a capacity-N resource is the demo.
  function bookUnits(resourceId: string, requested: number) {
    const sec = sections.find((s) => s.res.id === resourceId);
    if (!sec || !slot) return;
    const sl = slot;
    const n = sec.assigned ? 1 : Math.min(requested, sec.remaining);
    if (n < 1) return;
    const rows = Array.from({ length: n }, () => ({
      resourceId: sec.res.id,
      start: sl.start,
      end: sl.end,
      label: `${sec.tier} · ${sec.res.name}`,
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
        setSelectedId(null);
        setZoomedId(null);
        const ids = resources.filter((r) => r.section != null).map((r) => r.id);
        await loadBookings(ids, sl.start, sl.end);
      } catch (err) {
        toast.error(formatError(err instanceof Error ? err.message : String(err)));
      }
    });
  }

  function book() {
    if (selected) bookUnits(selected.res.id, qty);
  }

  function backToBowl() {
    setZoomedId(null);
    setSelectedId(null);
    setView((v) => ({ ...v, scale: Math.min(v.scale, ZOOM_DRILL_THRESHOLD - 0.4) }));
  }

  function onWheel(e: React.WheelEvent) {
    e.preventDefault();
    setView((v) => ({ ...v, scale: Math.min(4, Math.max(0.7, v.scale * (e.deltaY < 0 ? 1.12 : 0.89))) }));
  }
  function onPointerDown(e: React.PointerEvent) {
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
  }
  function onPointerMove(e: React.PointerEvent) {
    const d = dragRef.current;
    if (!d) return;
    setView((v) => ({ ...v, x: d.vx + (e.clientX - d.x), y: d.vy + (e.clientY - d.y) }));
  }
  function onPointerUp() {
    dragRef.current = null;
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-[#0a0a0c] text-zinc-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="h-4 w-4 animate-spin" />
          Connecting to deltat…
        </div>
      </div>
    );
  }

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
        {totalRemaining.toLocaleString()} of {totalCapacity.toLocaleString()} seats open across {sections.length} sections
      </div>
    </div>
  );

  // Pool sections drill into the seat grid (own Book button); the tray is just for premium boxes.
  const tray = selected && !zoomed ? (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex-1">
        <div className="text-sm font-medium text-zinc-100">
          {selected.tier} · {selected.res.name}
        </div>
        <div className="text-xs text-zinc-400">
          {selected.remaining.toLocaleString()} open
          {selected.price > 0 && ` · $${selected.price}/seat`}
          {selected.assigned && " · single box"}
        </div>
      </div>
      {!selected.assigned && (
        <div className="flex items-center gap-1.5">
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Minus className="h-3.5 w-3.5" />
          </Button>
          <span className="w-6 text-center font-mono text-sm text-zinc-100">{qty}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-zinc-300"
            onClick={() => setQty((q) => Math.min(MAX_QTY, selected.remaining, q + 1))}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      <Button
        onClick={book}
        disabled={isPending}
        className="bg-emerald-500 text-white hover:bg-emerald-400"
      >
        Book {selected.assigned ? "box" : qty}
        {selected.price > 0 &&
          ` · $${((selected.assigned ? 1 : qty) * selected.price).toLocaleString()}`}
      </Button>
    </div>
  ) : undefined;

  return (
    <>
      <Stage
        primitive={{ label: "Capacity sweep · atomic batch · GA pools", specId: "AVAIL-06" }}
        title="Olympia Stadium"
        ribbon={ribbon}
        tray={tray}
      >
        {zoomed && slot ? (
          <StadiumSection
            section={{
              id: zoomed.res.id,
              name: zoomed.res.name ?? zoomed.res.id,
              tier: zoomed.tier,
              capacity: zoomed.capacity,
              remaining: zoomed.remaining,
              price: zoomed.price,
            }}
            slot={slot}
            isPending={isPending}
            onBack={backToBowl}
            onBook={(count) => bookUnits(zoomed.res.id, count)}
          />
        ) : (
        <div className="relative">
          <div className="absolute right-2 top-2 z-10 flex flex-col gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-white/5 text-zinc-300"
              onClick={() => setView((v) => ({ ...v, scale: Math.min(4, v.scale * 1.2) }))}
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 bg-white/5 text-zinc-300"
              onClick={() => setView((v) => ({ ...v, scale: Math.max(0.7, v.scale / 1.2) }))}
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </Button>
          </div>

          <div
            className="h-[58vh] w-full cursor-grab touch-none overflow-hidden rounded-xl bg-[#08080a] active:cursor-grabbing"
            onWheel={onWheel}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
          >
            <svg viewBox="0 0 800 600" className="h-full w-full">
              <g transform={`translate(${view.x} ${view.y}) translate(400 300) scale(${view.scale}) translate(-400 -300)`}>
                {/* field */}
                <ellipse
                  cx={FIELD.cx}
                  cy={FIELD.cy}
                  rx={FIELD.rx}
                  ry={FIELD.ry}
                  fill="#0c1f14"
                  stroke="#1f3d2b"
                  strokeWidth={2}
                />
                <text
                  x={FIELD.cx}
                  y={FIELD.cy + 4}
                  textAnchor="middle"
                  className="fill-emerald-700 text-[13px] font-semibold uppercase tracking-widest"
                >
                  Field
                </text>

                {sections.map((s) => {
                  const { rx, ry } = ringRadii(s.ring);
                  const theta = ((s.idx + 0.5) / s.ringCount) * Math.PI * 2 - Math.PI / 2;
                  const px = FIELD.cx + rx * Math.cos(theta);
                  const py = FIELD.cy + ry * Math.sin(theta);
                  const deg = (theta * 180) / Math.PI + 90;
                  const w = Math.max(12, Math.min(54, ((2 * Math.PI * ((rx + ry) / 2)) / s.ringCount) * 0.82));
                  const h = s.assigned ? 16 : 30;
                  const isSel = s.res.id === selectedId;
                  return (
                    <g key={s.res.id} transform={`rotate(${deg} ${px} ${py})`}>
                      <rect
                        x={px - w / 2}
                        y={py - h / 2}
                        width={w}
                        height={h}
                        rx={4}
                        fill={fillFor(s)}
                        fillOpacity={s.remaining <= 0 ? 0.5 : 0.9}
                        stroke={isSel ? "#fff" : "rgba(255,255,255,0.12)"}
                        strokeWidth={isSel ? 2.5 : 1}
                        className={s.remaining > 0 ? "cursor-pointer" : "cursor-not-allowed"}
                        onClick={() => pick(s)}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>

          {/* legend */}
          <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-zinc-500">
            <Legend color="#10b981" label="plenty" />
            <Legend color="#f59e0b" label="filling" />
            <Legend color="#fb7185" label="nearly full" />
            <Legend color="#d4a843" label="premium box" />
            <Legend color="#27272a" label="sold out" />
            <span className="text-zinc-600">scroll to zoom · drag to pan · click a section for seats</span>
          </div>
        </div>
        )}
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
