"use client";

import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import {
  HOUR_MS,
  clock,
  countdown,
  dragSpan,
  firstDayOf,
  hourLabel,
  lastDayOf,
  midnightOf,
  monthOf,
  neighbour,
  stepSpan,
  toBlocks,
  type Axis,
  type BusySlot,
  type DayRow,
  type NavKey,
  type Slot,
} from "../lib/day-field";
import { createStore, useStore, type Store } from "../lib/field-store";
import {
  HOLD_TTL_MS,
  MAX_SPAN_MS,
  MIN_CELL_PX,
  TimerBar,
  centreOf,
  groupByDayStart,
  longDay,
  monthSpan,
  place,
  shortDay,
  useNearEnd,
  type FieldProps,
  type TakenSlot,
} from "./time-field-shared";

const NAV_KEYS: readonly string[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
const LABEL_W = "w-[8.25rem]";
const NONE: readonly never[] = [];

interface HoverInfo {
  span: Slot;
  dayStart: number;
  note?: string;
}
interface DragInfo {
  dayStart: number;
  span: Slot;
}

const rangeLabel = (span: Slot, slotMs: number) => (span.end - span.start > slotMs ? `${clock(span.start)} to ${clock(span.end)}` : clock(span.start));

/**
 * Where the month turns. The ruler corner names the months in view, but scrolling down gives no sign of
 * where one ends, so the first day of a new month starts under a labelled band. Decorative to a screen
 * reader: every cell already names its full date.
 */
function MonthDivider({ dayStart }: { dayStart: number }) {
  const label = new Date(dayStart).toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return (
    <div aria-hidden className="relative flex h-6 w-full border-t border-line-strong bg-[color-mix(in_oklab,var(--panel),var(--ink)_4%)]">
      <span className={cn(LABEL_W, "sticky left-0 z-10 flex shrink-0 items-center whitespace-nowrap bg-[color-mix(in_oklab,var(--panel),var(--ink)_4%)] px-3 font-mono text-[11px] font-medium uppercase tracking-wide text-ink")}>{label}</span>
    </div>
  );
}

/** The ruler: the month, the hours along the line, the hovered or dragged time as a chip, the chosen interval as a bar. */
function Ruler({ rows, axis, slotMs, trackMin, selected, hover, drag }: { rows: readonly DayRow[]; axis: Axis; slotMs: number; trackMin: number; selected: Slot | null; hover: Store<HoverInfo | null>; drag: Store<DragInfo | null> }) {
  const hovered = useStore(hover, (v) => v);
  const dragging = useStore(drag, (v) => v);
  const active: HoverInfo | null = dragging ? { span: dragging.span, dayStart: dragging.dayStart } : hovered;
  const at = active ? centreOf(active.span, active.dayStart, axis) : null;
  const hours = Array.from({ length: axis.toHour - axis.fromHour + 1 }, (_, i) => axis.fromHour + i);
  const ref = useRef<HTMLDivElement>(null);

  // A plain mouse wheel only scrolls up and down. Over the ruler it scrolls the hours sideways, when
  // there are more hours than fit; anywhere else on the field the wheel keeps its usual meaning.
  useEffect(() => {
    const el = ref.current;
    const box = el?.closest<HTMLElement>("[data-field-scroller]");
    if (!el || !box) return;
    const onWheel = (e: WheelEvent) => {
      if (box.scrollWidth <= box.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      box.scrollLeft += e.deltaY;
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <div ref={ref} className="sticky top-0 z-20 flex border-b border-line bg-panel">
      <div className={cn(LABEL_W, "sticky left-0 z-30 flex shrink-0 items-center bg-panel px-3 font-mono text-[11px] text-ink-2")}>{monthSpan(rows)}</div>
      <div className="relative h-8 flex-1" style={{ minWidth: trackMin }}>
        {hours.map((h, i) => {
          const pos = (i / (hours.length - 1)) * 100;
          return (
            <span
              key={h}
              className={cn(
                "absolute top-2 whitespace-nowrap font-mono text-[11px] tabular-nums text-ink-2 transition-opacity duration-100 motion-reduce:transition-none",
                i === 0 ? "" : i === hours.length - 1 ? "-translate-x-full" : "-translate-x-1/2",
                // about 65px of clearance either side of the chip, as a share of the track
                at !== null && Math.abs(pos - at) < 6500 / Math.max(trackMin, 900) && "opacity-0"
              )}
              style={{ left: `${pos}%` }}
            >
              {hourLabel(h)}
            </span>
          );
        })}
        {selected && <span aria-hidden className="absolute bottom-0 h-[3px] bg-signal" style={place(selected, midnightOf(selected.start), axis)} />}
        {active && at !== null && (
          <span aria-hidden className="absolute top-1 z-10 -translate-x-1/2 whitespace-nowrap rounded-[2px] bg-ink px-1 font-mono text-[11px] tabular-nums text-canvas" style={{ left: `${at}%` }}>
            {rangeLabel(active.span, slotMs)}
            {active.note ? ` ${active.note}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function DragPreview({ dayStart, axis, drag }: { dayStart: number; axis: Axis; drag: Store<DragInfo | null> }) {
  const span = useStore(drag, (v) => (v && v.dayStart === dayStart ? v.span : null));
  if (!span) return null;
  return <span aria-hidden className="pointer-events-none absolute inset-y-[2px] z-[7] border border-ink bg-signal/60" style={place(span, dayStart, axis)} />;
}

interface RowProps {
  row: DayRow;
  axis: Axis;
  trackMin: number;
  slotMs: number;
  selected: Slot | null;
  tabStart: number | null;
  managedStart: number | null;
  nowAt: number;
  alts: readonly Slot[];
  taken: readonly TakenSlot[];
  watched: ReadonlySet<number>;
  skew: number;
  bookingTtlMs: number;
  isSelectedDay: boolean;
  hover: Store<HoverInfo | null>;
  drag: Store<DragInfo | null>;
  register: (start: number, el: HTMLButtonElement | null) => void;
  onCellDown: (e: ReactPointerEvent, slot: Slot, dayStart: number) => void;
  onSelect: (span: Slot) => void;
  onManage: (booking: BusySlot) => void;
  onWatch: (span: Slot) => void;
}

const DayRowView = memo(function DayRowView(p: RowProps) {
  const { row, axis, slotMs, selected, hover } = p;
  const day = longDay(row.dayStart);
  const gridLines = {
    backgroundImage: "linear-gradient(to right, var(--line) 1px, transparent 1px)",
    backgroundSize: `calc(100% / ${axis.toHour - axis.fromHour}) 100%`,
  };
  const note = (span: Slot, text: string) => hover.set({ span, dayStart: row.dayStart, note: text });
  const leftOf = (until: number) => countdown(until - (Date.now() + p.skew));

  return (
    <div
      className={cn(
        "relative flex w-full border-t border-line [contain-intrinsic-size:auto_29px] [content-visibility:auto]",
        p.isSelectedDay && "bg-signal/[0.06] before:absolute before:inset-y-0 before:left-0 before:z-10 before:w-0.5 before:bg-signal"
      )}
      // 29: the top border takes one, which leaves the 2px-inset segments a full 24px, the minimum target.
      style={{ height: 29 }}
    >
      <span
        className={cn(
          LABEL_W,
          "sticky left-0 z-10 flex shrink-0 items-center whitespace-nowrap px-3 font-mono text-xs tabular-nums",
          p.isSelectedDay ? "bg-[color-mix(in_oklab,var(--panel),var(--signal)_6%)] font-medium text-ink" : "bg-panel text-ink/85"
        )}
      >
        {shortDay(row.dayStart)}
      </span>

      <span className="relative block flex-1" style={{ minWidth: p.trackMin, ...gridLines }}>
        {row.slots.map((slot) => {
          const checked = !!selected && slot.start >= selected.start && slot.end <= selected.end;
          return (
            <button
              key={slot.start}
              ref={(el) => p.register(slot.start, el)}
              type="button"
              role="radio"
              aria-checked={checked}
              aria-label={`${day}, ${formatTime(slot.start)}`}
              tabIndex={p.tabStart === slot.start ? 0 : -1}
              data-cell
              data-day={row.dayStart}
              data-start={slot.start}
              data-end={slot.end}
              onPointerDown={(e) => p.onCellDown(e, slot, row.dayStart)}
              onClick={(e) => e.detail === 0 && p.onSelect(slot)}
              onPointerEnter={() => hover.set({ span: slot, dayStart: row.dayStart })}
              onPointerLeave={() => hover.set(null)}
              onFocus={() => hover.set({ span: slot, dayStart: row.dayStart })}
              onBlur={() => hover.set(null)}
              // The 22px segment keeps a 28px target: the pseudo-element reaches the row's edges.
              className={cn(
                "absolute inset-y-[2px] flex touch-pan-y items-center justify-center border-r border-panel outline-none after:absolute after:-inset-y-[3px] after:inset-x-0",
                "transition-colors duration-100 ease-out motion-reduce:transition-none",
                "focus-visible:z-[6] focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-1 focus-visible:ring-offset-panel",
                checked ? "bg-transparent" : "bg-signal/50 hover:bg-signal/75"
              )}
              style={place(slot, row.dayStart, axis)}
            />
          );
        })}

        {selected && (
          <span aria-hidden className="pointer-events-none absolute inset-y-[2px] z-[5] flex items-center justify-center overflow-hidden whitespace-nowrap bg-signal font-mono text-[11px] font-medium tabular-nums text-signal-ink" style={place(selected, row.dayStart, axis)}>
            {rangeLabel(selected, slotMs)}
          </span>
        )}
        <DragPreview dayStart={row.dayStart} axis={axis} drag={p.drag} />

        {row.held.map((h) => (
          <button
            key={`held-${h.start}-${h.expiresAt}`}
            type="button"
            tabIndex={-1}
            aria-pressed={p.watched.has(h.start)}
            aria-label={`${day}, ${formatTime(h.start)}, held by someone else. ${p.watched.has(h.start) ? "Watching, press to stop" : "Press to be told if it opens"}`}
            onClick={() => p.onWatch(h)}
            onPointerEnter={() => note(h, `held ${leftOf(h.expiresAt)}`)}
            onPointerLeave={() => hover.set(null)}
            className={cn(
              "absolute inset-y-[2px] z-[3] overflow-hidden border border-hold/70 bg-hold/10 outline-none [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--hold)_55%,transparent)_0_2px,transparent_2px_6px)]",
              p.watched.has(h.start) && "z-[6] outline-2 outline-offset-1 outline-dotted outline-signal"
            )}
            style={place(h, row.dayStart, axis)}
          >
            <TimerBar until={h.expiresAt} totalMs={HOLD_TTL_MS} skew={p.skew} className="absolute inset-x-0 bottom-0 h-[2px] bg-hold" />
          </button>
        ))}

        {row.busy.map((b) =>
          b.mine ? (
            <button
              key={`mine-${b.start}`}
              type="button"
              tabIndex={-1}
              aria-label={`${day}, ${formatTime(b.start)}, your booking. Press to manage it`}
              onClick={() => p.onManage(b)}
              onPointerEnter={() => note(b, "yours")}
              onPointerLeave={() => hover.set(null)}
              className={cn("absolute inset-y-[2px] z-[4] flex items-center justify-center overflow-hidden bg-ink text-canvas outline-none", p.managedStart === b.start && "z-[6] ring-2 ring-signal ring-offset-1 ring-offset-panel")}
              style={place(b, row.dayStart, axis)}
            >
              <Check aria-hidden className="size-3.5" strokeWidth={3} />
              {b.expiresAt && <TimerBar until={b.expiresAt} totalMs={p.bookingTtlMs} skew={p.skew} className="absolute inset-x-0 bottom-0 h-[2px] bg-canvas/70" />}
            </button>
          ) : (
            <button
              key={`busy-${b.start}`}
              type="button"
              tabIndex={-1}
              aria-pressed={p.watched.has(b.start)}
              aria-label={`${day}, ${formatTime(b.start)}, booked. ${p.watched.has(b.start) ? "Watching, press to stop" : "Press to be told if it opens"}`}
              onClick={() => p.onWatch(b)}
              onPointerEnter={() => note(b, "booked")}
              onPointerLeave={() => hover.set(null)}
              className={cn("absolute inset-y-[2px] z-[3] border border-line-strong bg-ink/25 outline-none", p.watched.has(b.start) && "z-[6] outline-2 outline-offset-1 outline-dotted outline-signal")}
              style={place(b, row.dayStart, axis)}
            />
          )
        )}

        {p.alts.map((a) => (
          <span key={`alt-${a.start}`} aria-hidden className="pointer-events-none absolute inset-y-[1px] z-[6] border-2 border-dashed border-signal motion-safe:animate-pulse" style={place(a, row.dayStart, axis)} />
        ))}
        {p.taken.map((t) => (
          <span key={t.key} aria-hidden className="animate-taken pointer-events-none absolute inset-y-[2px] z-[8]" style={place(t, row.dayStart, axis)} />
        ))}
        {p.nowAt > 0 && p.nowAt < 100 && <span aria-hidden className="absolute inset-y-0 z-[9] w-px bg-ink" style={{ left: `${p.nowAt}%` }} />}
      </span>
    </div>
  );
});

export function WideField(props: FieldProps) {
  const { rows, axis, slotMs, selected, onSelect, managed, watched, alternatives, taken, now, more } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const cells = useRef(new Map<number, HTMLButtonElement>());
  const dragRef = useRef<{ anchor: Slot; dayStart: number } | null>(null);
  const hover = useMemo(() => createStore<HoverInfo | null>(null), []);
  const drag = useMemo(() => createStore<DragInfo | null>(null), []);

  const blocks = useMemo(() => toBlocks(rows), [rows]);
  const rowsByDay = useMemo(() => new Map(rows.map((r) => [r.dayStart, r])), [rows]);
  const freeSlots = useMemo(() => rows.flatMap((r) => r.slots), [rows]);
  const altsByDay = useMemo(() => groupByDayStart(alternatives, midnightOf), [alternatives]);
  const takenByDay = useMemo(() => groupByDayStart(taken, midnightOf), [taken]);
  const trackMin = (((axis.toHour - axis.fromHour) * HOUR_MS) / slotMs) * MIN_CELL_PX;
  const tabStop = selected?.start ?? freeSlots[0]?.start ?? null;
  const selectedDay = selected ? midnightOf(selected.start) : null;
  const today = midnightOf(now);

  const register = useCallback((start: number, el: HTMLButtonElement | null) => {
    if (el) cells.current.set(start, el);
    else cells.current.delete(start);
  }, []);

  const onCellDown = useCallback(
    (e: ReactPointerEvent, slot: Slot, dayStart: number) => {
      if (e.button !== 0) return;
      dragRef.current = { anchor: slot, dayStart };
      drag.set({ dayStart, span: slot });
    },
    [drag]
  );

  // The drag lives on the window: the pointer leaves the cell it started on within a few pixels.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = dragRef.current;
      const row = d && rowsByDay.get(d.dayStart);
      const el = d && document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-cell]");
      if (!d || !row || !el || Number(el.dataset.day) !== d.dayStart) return;
      const head = { start: Number(el.dataset.start), end: Number(el.dataset.end) };
      drag.set({ dayStart: d.dayStart, span: dragSpan(row.slots, d.anchor, head, slotMs, MAX_SPAN_MS) });
    };
    const finish = () => {
      const info = drag.get();
      dragRef.current = null;
      drag.set(null);
      if (!info) return;
      onSelect(info.span);
      cells.current.get(info.span.start)?.focus();
    };
    const cancel = () => {
      dragRef.current = null;
      drag.set(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [rowsByDay, slotMs, drag, onSelect]);

  function onKeyDown(e: KeyboardEvent) {
    if (!selected || !NAV_KEYS.includes(e.key)) return;
    e.preventDefault();
    if (e.shiftKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
      onSelect(stepSpan(freeSlots, selected, e.key === "ArrowRight" ? 1 : -1, slotMs, MAX_SPAN_MS));
      return;
    }
    const next = neighbour(rows, { start: selected.start, end: selected.start + slotMs }, e.key as NavKey);
    if (!next) return;
    onSelect(next);
    requestAnimationFrame(() => cells.current.get(next.start)?.focus());
  }

  // A field wider than the screen opens on the first thing there is to choose, not on midnight.
  useEffect(() => {
    const first = freeSlots[0];
    const el = first && cells.current.get(first.start);
    const box = scroller.current;
    if (el && box && box.scrollWidth > box.clientWidth) el.scrollIntoView({ inline: "center", block: "nearest" });
    // once, on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const marker = useNearEnd(scroller, !more.done && !more.loading, rows.length, more.onNeed);

  // Whether there is more of the line off the left or right edge, so the edges can say so.
  const [edge, setEdge] = useState({ left: false, right: false });
  useEffect(() => {
    const box = scroller.current;
    if (!box) return;
    const measure = () => {
      const next = { left: box.scrollLeft > 4, right: box.scrollLeft + box.clientWidth < box.scrollWidth - 4 };
      setEdge((prev) => (prev.left === next.left && prev.right === next.right ? prev : next));
    };
    measure();
    box.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    if (box.firstElementChild) observer.observe(box.firstElementChild);
    return () => {
      box.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);
  const fade = "pointer-events-none absolute inset-y-0 z-30 w-12 from-panel to-transparent transition-opacity duration-150 motion-reduce:transition-none";

  return (
    <div className="relative">
    <div ref={scroller} data-field-scroller className="relative max-h-[min(34rem,calc(100dvh-22rem))] select-none overflow-auto overscroll-contain [scrollbar-color:var(--line-strong)_transparent] [scrollbar-width:thin]">
      <div className="w-max min-w-full">
        <Ruler rows={rows} axis={axis} slotMs={slotMs} trackMin={trackMin} selected={selected} hover={hover} drag={drag} />

        <div role="radiogroup" aria-label="Open appointment times" onKeyDown={onKeyDown}>
          {blocks.map((block, index) => {
            const previous = blocks[index - 1];
            const divider = previous && monthOf(firstDayOf(block)) !== monthOf(lastDayOf(previous)) ? <MonthDivider dayStart={firstDayOf(block)} /> : null;
            if (block.kind === "closed") {
              const first = block.rows[0];
              const last = block.rows[block.rows.length - 1];
              const range = first === last ? shortDay(first.dayStart) : `${shortDay(first.dayStart)} to ${shortDay(last.dayStart)}`;
              return (
                <Fragment key={first.dayStart}>
                  {divider}
                  <div role="img" aria-label={`${range}, nothing open`} className="relative flex h-4 w-full border-t border-line">
                    <span className={cn(LABEL_W, "sticky left-0 z-10 flex shrink-0 items-center whitespace-nowrap bg-panel px-3 font-mono text-[11px] text-ink-2")}>{range}</span>
                    <span className="relative block flex-1" style={{ minWidth: trackMin }}>
                      <span aria-hidden className="absolute inset-x-0 top-1/2 border-t border-dashed border-line-strong" />
                    </span>
                  </div>
                </Fragment>
              );
            }
            const { row } = block;
            const here = selectedDay === row.dayStart;
            return (
              <Fragment key={row.dayStart}>
              {divider}
              <DayRowView
                row={row}
                axis={axis}
                trackMin={trackMin}
                slotMs={slotMs}
                selected={here ? selected : null}
                tabStart={tabStop !== null && midnightOf(tabStop) === row.dayStart ? tabStop : null}
                managedStart={managed && midnightOf(managed.start) === row.dayStart ? managed.start : null}
                nowAt={row.dayStart === today ? ((now - row.dayStart) / HOUR_MS - axis.fromHour) / (axis.toHour - axis.fromHour) * 100 : -1}
                alts={altsByDay.get(row.dayStart) ?? NONE}
                taken={takenByDay.get(row.dayStart) ?? NONE}
                watched={watched}
                skew={props.skew}
                bookingTtlMs={props.bookingTtlMs}
                isSelectedDay={here}
                hover={hover}
                drag={drag}
                register={register}
                onCellDown={onCellDown}
                onSelect={onSelect}
                onManage={props.onManage}
                onWatch={props.onWatch}
              />
              </Fragment>
            );
          })}
        </div>

        <div ref={marker} className="h-9 w-full">
          <span className="sticky left-0 flex h-full w-[min(100%,36rem)] items-center px-3 font-mono text-[11px] text-ink-2">
            {more.done ? "end of the schedule" : more.loading ? <span className="motion-safe:animate-pulse">reading further…</span> : " "}
          </span>
        </div>
      </div>
    </div>
    {/* The edges fade where the line carries on. The left one starts after the day labels, which stay put. */}
    <span aria-hidden className={cn(fade, "right-0 bg-gradient-to-l", edge.right ? "opacity-100" : "opacity-0")} />
    <span aria-hidden className={cn(fade, "left-[8.25rem] bg-gradient-to-r", edge.left ? "opacity-100" : "opacity-0")} />
    </div>
  );
}
