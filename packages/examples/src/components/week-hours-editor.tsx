"use client";

import { Plus, X } from "lucide-react";
import { Toggle } from "./ui/toggle";
import {
  DOW_ORDER,
  DOW_LABEL,
  TIME_OPTIONS,
  type TimeRange,
  type WeekHours,
} from "../examples/builder/schedule";

// The weekly open-hours editor, shared by the Weekly hours demo and the public "make a bookable"
// form. It edits a WeekHours value and nothing else: no saving, no deltat, no knowledge of who owns
// the schedule. Both callers turn the same shape into rules through weekToRanges.

const DEFAULT_RANGE: TimeRange = { start: "09:00", end: "17:00" };

export function WeekHoursEditor({
  week,
  onChange,
  disabled = false,
}: {
  week: WeekHours;
  onChange: (week: WeekHours) => void;
  disabled?: boolean;
}) {
  const setRanges = (dow: number, ranges: TimeRange[]) => onChange({ ...week, [dow]: ranges });
  const toggleDay = (dow: number) =>
    setRanges(dow, (week[dow]?.length ?? 0) > 0 ? [] : [{ ...DEFAULT_RANGE }]);
  const addRange = (dow: number) => setRanges(dow, [...(week[dow] ?? []), { ...DEFAULT_RANGE }]);
  const removeRange = (dow: number, idx: number) =>
    setRanges(dow, (week[dow] ?? []).filter((_, i) => i !== idx));
  const editRange = (dow: number, idx: number, field: "start" | "end", value: string) =>
    setRanges(
      dow,
      (week[dow] ?? []).map((r, i) => (i === idx ? { ...r, [field]: value } : r))
    );

  return (
    <div className="space-y-1.5">
      {DOW_ORDER.map((dow) => {
        const ranges = week[dow] ?? [];
        const on = ranges.length > 0;
        return (
          <div
            key={dow}
            className="flex min-h-[4.5rem] items-start gap-3 rounded-2xl border border-dt-line bg-dt-sunken px-3.5 py-3"
          >
            <div className="flex w-14 shrink-0 flex-col items-start gap-1.5">
              <span className="text-[13px] font-medium text-dt-ink">{DOW_LABEL[dow]}</span>
              <Toggle
                size="sm"
                pressed={on}
                disabled={disabled}
                onPressedChange={() => toggleDay(dow)}
                aria-label={`${on ? "Disable" : "Enable"} ${DOW_LABEL[dow]}`}
              >
                {on ? "Open" : "Off"}
              </Toggle>
            </div>
            {on ? (
              <div className="flex flex-1 flex-col gap-1.5">
                {ranges.map((r, idx) => (
                  <div key={idx} className="flex flex-wrap items-center gap-1.5">
                    <TimeSelect
                      value={r.start}
                      disabled={disabled}
                      onChange={(v) => editRange(dow, idx, "start", v)}
                    />
                    <span className="text-[12px] text-dt-ink-3">to</span>
                    <TimeSelect
                      value={r.end}
                      disabled={disabled}
                      onChange={(v) => editRange(dow, idx, "end", v)}
                    />
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => removeRange(dow, idx)}
                      className="relative ml-0.5 rounded-full p-1.5 text-dt-ink-3 transition-colors after:absolute after:-inset-2.5 hover:bg-dt-taken hover:text-dt-ink disabled:opacity-40"
                      aria-label="Remove range"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => addRange(dow)}
                  className="flex min-h-10 w-fit items-center gap-1 rounded-full px-1.5 text-[12px] font-medium text-dt-ink-2 transition-colors hover:text-dt-ink disabled:opacity-40"
                >
                  <Plus className="h-3 w-3" /> Add a range
                </button>
              </div>
            ) : (
              <div className="flex-1 self-center text-[12.5px] text-dt-ink-3">Closed</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 rounded-xl border border-dt-line-strong bg-dt-surface px-2.5 text-base tabular-nums text-dt-ink outline-none transition-colors focus-visible:border-dt-ink sm:h-8 sm:text-[12.5px] disabled:opacity-40"
    >
      {TIME_OPTIONS.map((t) => (
        <option key={t} value={t} className="bg-dt-surface text-dt-ink">
          {t}
        </option>
      ))}
    </select>
  );
}
