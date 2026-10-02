"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import { cn } from "@open-deltat/shared/utils";
import { formatTime } from "@open-deltat/shared/time";
import { cellsOfDay, monthOf, type DayRow } from "../lib/day-field";
import { TimerBar, HOLD_TTL_MS, longDay, useNearEnd, weekdayShort, type FieldProps } from "./time-field-shared";

/**
 * Arrow keys inside a radio group move focus along its radios: one step for left and right, a row for up
 * and down. Home and End go to the ends. Focus only moves; what it lands on decides for itself whether
 * that also chooses it (a day does, a time does not, because a time holds).
 */
const moveWithin =
  (columns: number) =>
  (e: KeyboardEvent<HTMLElement>) => {
    const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
    const at = radios.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    const step: Record<string, number | undefined> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns, ArrowUp: -columns };
    const target = e.key === "Home" ? radios[0] : e.key === "End" ? radios[radios.length - 1] : radios[at + (step[e.key] ?? NaN)];
    if (!target) return;
    e.preventDefault();
    target.focus();
  };

/**
 * The phone layout: a strip of days, then the chosen day's times as a hairline grid of 44px cells. A
 * 20px segment cannot be tapped, so the field becomes this. Opening a day only shows its times; nothing
 * is chosen, and so nothing is held, until a time is tapped. Longer than one slot is the stepper's job.
 */
export function NarrowPicker({ rows, slotMs, selected, onSelect, managed, onManage, watched, onWatch, alternatives, skew, bookingTtlMs, more }: FieldProps) {
  const strip = useRef<HTMLDivElement>(null);
  const chips = useRef(new Map<number, HTMLButtonElement>());
  const firstOpen = rows.find((r) => r.slots.length > 0);
  const [picked, setPicked] = useState<number | null>(null);

  const dayStart = picked ?? (selected ? rows.find((r) => r.slots.some((s) => s.start === selected.start))?.dayStart : undefined) ?? firstOpen?.dayStart ?? null;
  const row = rows.find((r) => r.dayStart === dayStart);
  const cells = useMemo(() => (row ? cellsOfDay(row, slotMs) : []), [row, slotMs]);
  const busiest = Math.max(1, ...rows.map((r) => r.slots.length));
  const marker = useNearEnd(strip, !more.done && !more.loading, rows.length, more.onNeed);

  useEffect(() => {
    if (dayStart === null) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    chips.current.get(dayStart)?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [dayStart]);

  return (
    <>
      <div ref={strip} role="radiogroup" aria-label="Day" onKeyDown={moveWithin(1)} className="flex snap-x overflow-x-auto border-b border-line [scrollbar-width:none]">
        {rows.map((r, i) => (
          <Fragment key={r.dayStart}>
            {i > 0 && monthOf(rows[i - 1].dayStart) !== monthOf(r.dayStart) && <MonthMark dayStart={r.dayStart} />}
            <DayChip
              row={r}
              checked={r.dayStart === dayStart}
              busiest={busiest}
              onPick={() => setPicked(r.dayStart)}
              register={(el) => {
                if (el) chips.current.set(r.dayStart, el);
                else chips.current.delete(r.dayStart);
              }}
            />
          </Fragment>
        ))}
        <span ref={marker} aria-hidden className="block w-px shrink-0" />
      </div>

      {row ? (
        <section>
          <h3 className="flex items-baseline justify-between px-4 py-3 text-sm">
            <span className="font-medium text-ink">{longDay(row.dayStart)}</span>
            <span className="font-mono text-xs tabular-nums text-ink-2">{row.slots.length} open</span>
          </h3>
          <div role="radiogroup" aria-label={`Times on ${longDay(row.dayStart)}`} onKeyDown={moveWithin(3)} className="grid grid-cols-3 overflow-hidden border-t border-line [&>*]:border-b [&>*]:border-r [&>*]:border-line">
            {cells.map((c) => {
              const ringed = alternatives.some((a) => c.start >= a.start && c.end <= a.end);
              const ring = ringed ? "outline-2 -outline-offset-2 outline-dashed outline-signal" : "";
              if (c.kind === "free") {
                const checked = !!selected && c.start >= selected.start && c.end <= selected.end;
                return (
                  <button
                    key={`f-${c.start}`}
                    type="button"
                    role="radio"
                    aria-checked={checked}
                    // One tab stop for the whole grid: the chosen time, or else the first open one.
                    tabIndex={c.start === (selected?.start ?? cells.find((x) => x.kind === "free")?.start) ? 0 : -1}
                    onClick={() => onSelect({ start: c.start, end: c.end })}
                    className={cn(
                      "h-11 touch-manipulation font-mono text-[13px] tabular-nums outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink motion-reduce:transition-none",
                      ring,
                      checked ? "bg-signal font-medium text-signal-ink" : "bg-panel text-ink active:bg-line"
                    )}
                  >
                    {formatTime(c.start)}
                  </button>
                );
              }
              if (c.kind === "held") {
                const on = watched.has(c.source.start);
                return (
                  <button
                    key={`h-${c.start}`}
                    type="button"
                    aria-pressed={on}
                    aria-label={`${formatTime(c.start)}, held by someone else. ${on ? "Watching" : "Press to be told if it opens"}`}
                    onClick={() => onWatch(c.source)}
                    className={cn("relative h-11 touch-manipulation overflow-hidden bg-panel font-mono text-[13px] tabular-nums text-ink outline-none [background-image:repeating-linear-gradient(135deg,color-mix(in_oklab,var(--hold)_45%,transparent)_0_2px,transparent_2px_6px)]", on && "outline-2 -outline-offset-2 outline-dotted outline-signal")}
                  >
                    <span className="bg-panel/85 px-1.5">{formatTime(c.start)}</span>
                    <TimerBar until={c.source.expiresAt} totalMs={HOLD_TTL_MS} skew={skew} className="absolute inset-x-0 bottom-0 h-[2px] bg-hold" />
                  </button>
                );
              }
              if (c.source.mine) {
                const source = c.source;
                return (
                  <button
                    key={`m-${c.start}`}
                    type="button"
                    aria-label={`${formatTime(c.start)}, your booking. Press to manage it`}
                    onClick={() => onManage(source)}
                    className={cn("relative flex h-11 touch-manipulation items-center justify-center gap-1.5 overflow-hidden bg-ink font-mono text-[13px] tabular-nums text-canvas outline-none", managed?.start === source.start && "outline-2 -outline-offset-2 outline-signal")}
                  >
                    <Check aria-hidden className="size-3.5" strokeWidth={3} />
                    {formatTime(c.start)}
                    {source.expiresAt && <TimerBar until={source.expiresAt} totalMs={bookingTtlMs} skew={skew} className="absolute inset-x-0 bottom-0 h-[2px] bg-canvas/70" />}
                  </button>
                );
              }
              const on = watched.has(c.source.start);
              const source = c.source;
              return (
                <button
                  key={`b-${c.start}`}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${formatTime(c.start)}, booked. ${on ? "Watching" : "Press to be told if it opens"}`}
                  onClick={() => onWatch(source)}
                  className={cn("h-11 touch-manipulation bg-ink/25 font-mono text-[13px] tabular-nums text-ink outline-none", on && "outline-2 -outline-offset-2 outline-dotted outline-signal")}
                >
                  {formatTime(c.start)}
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <p className="px-4 py-6 text-sm text-ink-2">Nothing in view yet.</p>
      )}
    </>
  );
}

// Where the month turns along the strip. Decorative: each day's own label already carries its month.
function MonthMark({ dayStart }: { dayStart: number }) {
  const month = new Date(dayStart).toLocaleDateString(undefined, { month: "short" }).toUpperCase();
  return (
    <span aria-hidden className="grid h-[4.5rem] w-8 shrink-0 snap-start place-items-center border-r border-line-strong bg-[color-mix(in_oklab,var(--panel),var(--ink)_4%)] font-mono text-[11px] font-medium tracking-wide text-ink [writing-mode:vertical-rl]">
      {month}
    </span>
  );
}

function DayChip({ row, checked, busiest, onPick, register }: { row: DayRow; checked: boolean; busiest: number; onPick: () => void; register: (el: HTMLButtonElement | null) => void }) {
  const hasTime = row.slots.length > 0 || row.held.length > 0 || row.busy.length > 0;
  const open = row.slots.length;
  const body = (
    <>
      <span className="font-mono text-[11px]">{weekdayShort(row.dayStart).toUpperCase()}</span>
      <span className="font-mono text-base font-medium tabular-nums">{String(new Date(row.dayStart).getDate()).padStart(2, "0")}</span>
      <span aria-hidden className={cn("h-[3px] w-6", hasTime ? (checked ? "bg-signal-ink/30" : "bg-line-strong") : "border-t border-dashed border-line-strong")}>
        {open > 0 && <span className={cn("block h-full", checked ? "bg-signal-ink" : "bg-signal")} style={{ width: `${(open / busiest) * 100}%` }} />}
      </span>
    </>
  );
  const chip = "flex h-[4.5rem] w-14 shrink-0 snap-start flex-col items-center justify-center gap-1 border-r border-line";
  return hasTime ? (
    <button
      ref={register}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={`${longDay(row.dayStart)}, ${open} open times`}
      // The strip is one tab stop; arrows move along it, and landing on a day shows that day.
      tabIndex={checked ? 0 : -1}
      onFocus={onPick}
      onClick={onPick}
      className={cn(chip, "touch-manipulation outline-none transition-colors duration-100 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ink motion-reduce:transition-none", checked ? "bg-signal text-signal-ink" : "text-ink active:bg-line")}
    >
      {body}
    </button>
  ) : (
    <div role="img" aria-label={`${longDay(row.dayStart)}, nothing open`} className={cn(chip, "text-ink-2")}>
      {body}
    </div>
  );
}
