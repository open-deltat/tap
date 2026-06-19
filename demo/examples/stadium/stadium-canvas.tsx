"use client";

import { useEffect, useRef, useCallback } from "react";
import {
  FIELD,
  SEAT_THRESHOLD,
  type Transform,
  type Rect,
  sectionFrame,
  localRect,
  worldToLocal,
  screenToWorld,
  pointInRect,
  frameWorldBBox,
  rectsIntersect,
  gridDims,
} from "./geometry";

export interface CanvasSection {
  id: string;
  ring: number;
  idx: number;
  ringCount: number;
  assigned: boolean;
  capacity: number;
  remaining: number;
}

// Result of clicking the canvas while zoomed into seats: a single seat cell to toggle.
// Clicks while zoomed out (Overview/Close-up) are ignored — zoom changes only via wheel/buttons.
export type CanvasHit = { kind: "cell"; section: CanvasSection; cell: number };

const COLORS = {
  bg: "#08080a",
  field: "#0c1f14",
  fieldStroke: "#1f3d2b",
  fieldText: "#15803d",
  emerald: "#10b981",
  amber: "#f59e0b",
  rose: "#fb7185",
  zinc: "#27272a",
  gold: "#d4a843",
  taken: "#3f3f46",
  selectStroke: "#ffffff",
  label: "rgba(255,255,255,0.55)",
};

function fillFor(s: CanvasSection): string {
  if (s.remaining <= 0) return COLORS.zinc;
  if (s.assigned) return COLORS.gold;
  const ratio = s.remaining / s.capacity;
  if (ratio > 0.5) return COLORS.emerald;
  if (ratio > 0.15) return COLORS.amber;
  return COLORS.rose;
}

export function StadiumCanvas({
  sections,
  transform,
  selectedSectionId,
  selectedCells,
  onTransformChange,
  onZoomStep,
  onHit,
}: {
  sections: CanvasSection[];
  transform: Transform;
  selectedSectionId: string | null;
  selectedCells: Set<number>;
  onTransformChange: (t: Transform) => void;
  // One wheel gesture (debounced) = one level step. `focusX/Y` are the world point under
  // the cursor to keep stable across the zoom; the parent decides the target level + offset.
  onZoomStep: (direction: 1 | -1, focusX: number, focusY: number) => void;
  onHit: (hit: CanvasHit) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number>(0);
  const drawScheduledRef = useRef(false);

  // Mutable mirrors so the rAF draw + pointer handlers read current values without
  // re-binding listeners on every render.
  const tRef = useRef(transform);
  tRef.current = transform;
  const sectionsRef = useRef(sections);
  sectionsRef.current = sections;
  const selSectionRef = useRef(selectedSectionId);
  selSectionRef.current = selectedSectionId;
  const selCellsRef = useRef(selectedCells);
  selCellsRef.current = selectedCells;

  // Cached frames keyed by section id — geometry is stable for a given layout.
  const framesRef = useRef(new Map<string, ReturnType<typeof sectionFrame>>());
  useEffect(() => {
    const m = new Map<string, ReturnType<typeof sectionFrame>>();
    for (const s of sections) m.set(s.id, sectionFrame(s.ring, s.idx, s.ringCount, s.assigned));
    framesRef.current = m;
    scheduleDraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sections]);

  const draw = useCallback(() => {
    drawScheduledRef.current = false;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = container.clientWidth;
    const cssH = container.clientHeight;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, cssW, cssH);

    const t = tRef.current;
    // Viewport in world coordinates (for culling).
    const viewport: Rect = {
      x: -t.offsetX / t.scale,
      y: -t.offsetY / t.scale,
      w: cssW / t.scale,
      h: cssH / t.scale,
    };

    // World→screen baked into the ctx transform; we draw in world units below.
    ctx.save();
    ctx.translate(t.offsetX, t.offsetY);
    ctx.scale(t.scale, t.scale);

    // Field.
    ctx.beginPath();
    ctx.ellipse(FIELD.cx, FIELD.cy, FIELD.rx, FIELD.ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.field;
    ctx.fill();
    ctx.lineWidth = 3 / t.scale;
    ctx.strokeStyle = COLORS.fieldStroke;
    ctx.stroke();
    if (t.scale < SEAT_THRESHOLD) {
      ctx.fillStyle = COLORS.fieldText;
      ctx.font = "600 28px ui-sans-serif, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("FIELD", FIELD.cx, FIELD.cy);
    }

    const seatLOD = t.scale >= SEAT_THRESHOLD;

    for (const s of sectionsRef.current) {
      const f = framesRef.current.get(s.id);
      if (!f) continue;
      // Cull: skip sections whose world bbox doesn't meet the viewport.
      if (!rectsIntersect(frameWorldBBox(f), viewport)) continue;

      const r = localRect(f);
      ctx.save();
      ctx.translate(f.cx, f.cy);
      ctx.rotate(f.angle);

      if (!seatLOD) {
        // One shape per section, colored by availability.
        ctx.beginPath();
        roundRect(ctx, r.x, r.y, r.w, r.h, Math.min(8, r.w * 0.15));
        ctx.fillStyle = fillFor(s);
        ctx.globalAlpha = s.remaining <= 0 ? 0.5 : 0.92;
        ctx.fill();
        ctx.globalAlpha = 1;
        if (s.id === selSectionRef.current) {
          ctx.lineWidth = 3 / t.scale;
          ctx.strokeStyle = COLORS.selectStroke;
          ctx.stroke();
        }
      } else {
        // Seat grid. taken = first (capacity - remaining) cells; rest are free.
        drawSeats(ctx, s, r, t, f, viewport, selSectionRef.current, selCellsRef.current);
      }
      ctx.restore();
    }

    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    if (drawScheduledRef.current) return;
    drawScheduledRef.current = true;
    frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  // Redraw whenever inputs change.
  useEffect(() => {
    scheduleDraw();
  }, [transform, selectedSectionId, selectedCells, scheduleDraw]);

  // Resize handling.
  useEffect(() => {
    const ro = new ResizeObserver(() => scheduleDraw());
    if (containerRef.current) ro.observe(containerRef.current);
    return () => {
      ro.disconnect();
      cancelAnimationFrame(frameRef.current);
    };
  }, [scheduleDraw]);

  // Wheel zoom: discrete levels. Debounce so one scroll gesture steps exactly one level,
  // zooming toward the cursor (the world point under it stays put across the eased step).
  const wheelLockRef = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let releaseTimer: ReturnType<typeof setTimeout> | undefined;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      // Trailing wheel events from the same gesture keep resetting the release timer.
      if (releaseTimer) clearTimeout(releaseTimer);
      releaseTimer = setTimeout(() => {
        wheelLockRef.current = false;
      }, 140);
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      const rect = el.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const [wx, wy] = screenToWorld(tRef.current, sx, sy);
      onZoomStep(e.deltaY < 0 ? 1 : -1, wx, wy);
    };
    el.addEventListener("wheel", handler, { passive: false });
    return () => {
      el.removeEventListener("wheel", handler);
      if (releaseTimer) clearTimeout(releaseTimer);
    };
  }, [onZoomStep]);

  // Pointer drag-pan + click hit-testing (distinguish a click from a drag).
  const dragRef = useRef<{
    x: number;
    y: number;
    ox: number;
    oy: number;
    moved: boolean;
  } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    const t = tRef.current;
    dragRef.current = { x: e.clientX, y: e.clientY, ox: t.offsetX, oy: t.offsetY, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) d.moved = true;
    onTransformChange({ scale: tRef.current.scale, offsetX: d.ox + dx, offsetY: d.oy + dy });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d || d.moved) return;
    handleClick(e.clientX, e.clientY);
  };

  const handleClick = (clientX: number, clientY: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const sx = clientX - rect.left;
    const sy = clientY - rect.top;
    const t = tRef.current;
    // Clicks only do something at the seat LOD — they never change zoom.
    if (t.scale < SEAT_THRESHOLD) return;
    const [wx, wy] = screenToWorld(t, sx, sy);

    for (const s of sectionsRef.current) {
      const f = framesRef.current.get(s.id);
      if (!f) continue;
      const [lx, ly] = worldToLocal(f, wx, wy);
      const r = localRect(f);
      if (!pointInRect(r, lx, ly)) continue;

      // Map local point → cell index.
      const { cols, rows } = gridDims(s.capacity, r.w, r.h);
      const col = clamp(Math.floor(((lx - r.x) / r.w) * cols), 0, cols - 1);
      const row = clamp(Math.floor(((ly - r.y) / r.h) * rows), 0, rows - 1);
      const cell = row * cols + col;
      if (cell >= s.capacity) return;
      onHit({ kind: "cell", section: s, cell });
      return;
    }
  };

  return (
    <div
      ref={containerRef}
      className="h-[58vh] w-full cursor-grab touch-none overflow-hidden rounded-xl bg-[#08080a] active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => (dragRef.current = null)}
    >
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}

function drawSeats(
  ctx: CanvasRenderingContext2D,
  s: CanvasSection,
  r: Rect,
  t: Transform,
  f: ReturnType<typeof sectionFrame>,
  viewport: Rect,
  selectedSectionId: string | null,
  selectedCells: Set<number>
) {
  const { cols, rows } = gridDims(s.capacity, r.w, r.h);
  const cw = r.w / cols;
  const ch = r.h / rows;
  const pad = Math.min(cw, ch) * 0.12;
  const taken = Math.max(0, s.capacity - s.remaining);
  const isSel = s.id === selectedSectionId;

  // Inverse-transform the viewport corners into this rotated local frame for cell culling.
  const localView = worldRectToLocalAABB(viewport, f);

  ctx.fillStyle = COLORS.taken;
  for (let i = 0; i < s.capacity; i++) {
    const col = i % cols;
    const row = (i - col) / cols;
    const x = r.x + col * cw;
    const y = r.y + row * ch;
    // Cull cells outside the viewport (in local space).
    if (
      x + cw < localView.x ||
      x > localView.x + localView.w ||
      y + ch < localView.y ||
      y > localView.y + localView.h
    ) {
      continue;
    }
    const isTaken = i < taken;
    const picked = isSel && selectedCells.has(i);
    ctx.fillStyle = isTaken ? COLORS.taken : picked ? COLORS.emerald : fillFor(s);
    ctx.globalAlpha = isTaken ? 0.8 : picked ? 1 : 0.85;
    ctx.fillRect(x + pad, y + pad, cw - pad * 2, ch - pad * 2);
    if (picked) {
      ctx.globalAlpha = 1;
      ctx.lineWidth = 1.5 / t.scale;
      ctx.strokeStyle = COLORS.selectStroke;
      ctx.strokeRect(x + pad, y + pad, cw - pad * 2, ch - pad * 2);
    }
  }
  ctx.globalAlpha = 1;
}

// Axis-aligned bbox of a world rect expressed in a frame's local coordinates.
function worldRectToLocalAABB(world: Rect, f: ReturnType<typeof sectionFrame>): Rect {
  const corners: [number, number][] = [
    [world.x, world.y],
    [world.x + world.w, world.y],
    [world.x, world.y + world.h],
    [world.x + world.w, world.y + world.h],
  ];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [wx, wy] of corners) {
    const [lx, ly] = worldToLocal(f, wx, wy);
    minX = Math.min(minX, lx);
    minY = Math.min(minY, ly);
    maxX = Math.max(maxX, lx);
    maxY = Math.max(maxY, ly);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radius: number) {
  const rad = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
