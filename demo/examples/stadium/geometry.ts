// Pure geometry for the canvas stadium. No React, no DOM — just the math that maps
// sections onto concentric oval rings and converts between world/screen/section-local
// frames. Kept separate so hit-testing and drawing share one source of truth.

export const WORLD = { w: 1600, h: 1200 };
export const FIELD = { cx: WORLD.w / 2, cy: WORLD.h / 2, rx: 240, ry: 150 };

// Zoom level at which we stop drawing one shape per section and start drawing seat cells.
export const SEAT_THRESHOLD = 2.4;

export interface Transform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

// Discrete zoom ladder. Index into LEVELS, not a free scale.
//   L0 Overview   — whole stadium fits, sections as blocks, no seats
//   L1 Close-up   — one step in, bigger blocks, still no seats
//   L2 Seats      — seats appear (this is SEAT_THRESHOLD)
//   L3 Seats      — seats appear (this is SEAT_THRESHOLD)
//   L4 Individual — one more step, seats large/clear
//   L5 Seat IDs   — deepest step: seats big enough to carry a row/seat label
// The default (level 0) is the most zoomed-out "Stadium" view, centered with margin.
export const SEAT_LEVEL = 3;

// Build the scale ladder for the current canvas size. lWide is a step further out than fit (so the
// whole bowl sits centered with margin and reads as one shape); the seat threshold is L3.
export function zoomLevels(viewW: number, viewH: number): number[] {
  const fit = fitScale(viewW, viewH);
  const l0 = Math.min(fit, SEAT_THRESHOLD * 0.5); // never start already near seats
  const lWide = l0 * 0.72; // one more step out — the default, centered with margin
  const l2 = SEAT_THRESHOLD;
  const l1 = Math.sqrt(l0 * l2); // geometric midpoint feels even between steps
  const l3 = SEAT_THRESHOLD * 1.6;
  const l4 = SEAT_THRESHOLD * 3.5; // individual seats — large enough for an ID label
  return [lWide, l0, l1, l2, l3, l4];
}

// Largest scale that still fits the whole WORLD in the canvas, with a small margin.
export function fitScale(viewW: number, viewH: number): number {
  const margin = 0.92;
  return Math.min(viewW / WORLD.w, viewH / WORLD.h) * margin;
}

// Transform that places world point (wx, wy) at the canvas center for a given scale.
export function transformCenteredOn(
  scale: number,
  wx: number,
  wy: number,
  viewW: number,
  viewH: number
): Transform {
  return { scale, offsetX: viewW / 2 - wx * scale, offsetY: viewH / 2 - wy * scale };
}

// Human-readable name for each ladder level, indexed to match `zoomLevels`.
const LEVEL_NAMES = ["Stadium", "Overview", "Close-up", "Seats", "Individual", "Seat IDs"] as const;

export function levelName(level: number): string {
  return LEVEL_NAMES[Math.max(0, Math.min(LEVEL_NAMES.length - 1, level))];
}

// Index of the ladder level nearest to a given scale (log space, so steps read evenly).
export function nearestLevel(levels: number[], scale: number): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < levels.length; i++) {
    const d = Math.abs(Math.log(scale) - Math.log(levels[i]));
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// A section's footprint: a rect in a local frame rotated by `angle` about (cx, cy).
// World point P maps to local by translating to (cx,cy) then rotating by -angle.
export interface SectionFrame {
  cx: number; // center in world space
  cy: number;
  angle: number; // rotation of the local frame (radians)
  w: number; // local width  (tangential — seats per row spread along this)
  h: number; // local height (radial)
}

export function screenToWorld(t: Transform, sx: number, sy: number): [number, number] {
  return [(sx - t.offsetX) / t.scale, (sy - t.offsetY) / t.scale];
}

// Radial band for a ring: inner→outer radius pair. Rings stack outward from the field.
function ringRadii(ring: number): { inner: number; outer: number } {
  const bandRx = FIELD.rx + 70;
  const inner = bandRx + ring * 150;
  return { inner, outer: inner + 120 };
}

/**
 * Place a section as a rotated rect on its ring. `theta` is the radial angle; the local frame
 * is rotated so the rect's height runs radially (out from the field) and its width runs
 * tangentially (along the ring). Aspect of the ellipse is folded into the center position only,
 * so the local rect stays axis-aligned and a seat grid maps cleanly into it.
 */
export function sectionFrame(
  ring: number,
  idx: number,
  ringCount: number,
  assigned: boolean
): SectionFrame {
  const { inner, outer } = ringRadii(ring);
  const mid = (inner + outer) / 2;
  const theta = ((idx + 0.5) / ringCount) * Math.PI * 2 - Math.PI / 2;

  // Ellipse aspect — stretches the ring horizontally to match the oval field.
  const aspect = FIELD.rx / FIELD.ry;
  const cx = FIELD.cx + mid * aspect * Math.cos(theta);
  const cy = FIELD.cy + mid * Math.sin(theta);

  // Tangential width: the ring's circumference split across its sections, minus a gap.
  const circ = 2 * Math.PI * mid;
  const w = (circ / ringCount) * 0.82;
  const h = assigned ? (outer - inner) * 0.4 : (outer - inner) * 0.78;

  // Local +Y points radially outward; rotate the frame so it does.
  return { cx, cy, angle: theta + Math.PI / 2, w, h };
}

// Local rect of a section, centered at the origin of its rotated frame.
export function localRect(f: SectionFrame): Rect {
  return { x: -f.w / 2, y: -f.h / 2, w: f.w, h: f.h };
}

// World → section-local coordinates (translate to center, inverse-rotate).
export function worldToLocal(f: SectionFrame, wx: number, wy: number): [number, number] {
  const dx = wx - f.cx;
  const dy = wy - f.cy;
  const c = Math.cos(-f.angle);
  const s = Math.sin(-f.angle);
  return [dx * c - dy * s, dx * s + dy * c];
}

export function pointInRect(r: Rect, x: number, y: number): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

// Axis-aligned world bounding box of a rotated section frame — for cheap viewport culling.
export function frameWorldBBox(f: SectionFrame): Rect {
  const hw = f.w / 2;
  const hh = f.h / 2;
  const c = Math.cos(f.angle);
  const s = Math.sin(f.angle);
  const ex = Math.abs(hw * c) + Math.abs(hh * s);
  const ey = Math.abs(hw * s) + Math.abs(hh * c);
  return { x: f.cx - ex, y: f.cy - ey, w: ex * 2, h: ey * 2 };
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Choose a near-square grid for `capacity` cells inside a w×h local rect, biased so columns
// run along the wider (tangential) axis.
export function gridDims(capacity: number, w: number, h: number): { cols: number; rows: number } {
  if (capacity <= 0) return { cols: 1, rows: 1 };
  const aspect = w / h;
  const cols = Math.max(1, Math.round(Math.sqrt(capacity * aspect)));
  const rows = Math.max(1, Math.ceil(capacity / cols));
  return { cols, rows };
}

// Column count for a section's seat grid. Deterministic from the section's layout, so the
// canvas (drawing), the booking label (which seat was taken) and the loader (parsing it back)
// all agree on the same grid without passing geometry around.
export function sectionCols(
  ring: number,
  idx: number,
  ringCount: number,
  assigned: boolean,
  capacity: number
): number {
  const r = localRect(sectionFrame(ring, idx, ringCount, assigned));
  return gridDims(capacity, r.w, r.h).cols;
}

// Cell index ⇄ human seat id (row letter + seat number), e.g. cell 0 → "A1". Used for the
// on-canvas seat labels AND to record which exact seat a booking took, so booked seats render
// where they were picked instead of collapsing to the first N cells.
function rowLabel(row: number): string {
  let s = "";
  let n = row + 1; // bijective base-26: 1→A, 26→Z, 27→AA
  while (n > 0) {
    n -= 1;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s;
}

export function seatId(cell: number, cols: number): string {
  const row = Math.floor(cell / cols);
  const col = cell % cols;
  return `${rowLabel(row)}${col + 1}`;
}

export function cellFromSeatId(id: string, cols: number): number | null {
  const s = id.trim();
  let i = 0;
  while (i < s.length && s[i] >= "A" && s[i] <= "Z") i++;
  const letters = s.slice(0, i);
  const digits = s.slice(i);
  if (!letters || !digits) return null;
  const num = Number(digits);
  if (!Number.isInteger(num) || num < 1) return null;
  let row = 0;
  for (const ch of letters) row = row * 26 + (ch.charCodeAt(0) - 64);
  row -= 1;
  const col = num - 1;
  if (col >= cols) return null;
  return row * cols + col;
}
