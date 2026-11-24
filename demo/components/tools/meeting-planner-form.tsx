"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Check, Copy, Loader2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { plan, type PlanResult } from "@/lib/tools/planner-actions";
import type { Span } from "@/lib/tools/overlap";

interface Row {
  readonly id: number;
  readonly zone: string;
  readonly from: string;
  readonly to: string;
}

const DEFAULT_OTHERS = ["Europe/London", "America/New_York"] as const;

const todayIn = (zone: string) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(Date.now());
const clock = (ms: number, zone: string) => new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit" }).format(ms);
const city = (zone: string) => zone.split("/").at(-1)?.replaceAll("_", " ") ?? zone;
const range = (s: Span, zone: string) => `${clock(s.start, zone)} to ${clock(s.end, zone)}`;
const hours = (s: Span) => Math.round(((s.end - s.start) / 3_600_000) * 10) / 10;

const ownZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Browser-only (meeting-planner.tsx loads it with ssr: false): the visitor's zone and today's date
// exist only there, so the first render can already start from them.
export default function MeetingPlannerForm() {
  const [rows, setRows] = useState<Row[]>(() => [ownZone(), ...DEFAULT_OTHERS.filter((z) => z !== ownZone())].map((zone, id) => ({ id, zone, from: "09:00", to: "17:00" })));
  const [date, setDate] = useState(() => todayIn(ownZone()));
  const [zones] = useState<readonly string[]>(() => Intl.supportedValuesOf("timeZone"));
  const [result, setResult] = useState<PlanResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    const t = setTimeout(() => start(async () => setResult(await plan({ date, people: rows.map(({ zone, from, to }) => ({ zone, from, to })) }))), 200);
    return () => clearTimeout(t);
  }, [rows, date]);

  const update = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const organiser = rows[0]?.zone ?? "UTC";
  const done = result?.ok ? result.plan : null;

  const summary = useMemo(() => {
    if (!done) return "";
    if (done.overlap.length === 0) return `${date}: no hour when everyone is working.`;
    return done.overlap.map((s) => rows.map((r) => `${city(r.zone)} ${range(s, r.zone)}`).join(" · ")).join("\n");
  }, [done, rows, date]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(`${date}\n${summary}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <datalist id="tz-list">
        {zones.map((z) => (
          <option key={z} value={z} />
        ))}
      </datalist>

      <div className="border-b border-dt-line p-4 sm:p-6">
        <label className="flex flex-wrap items-center gap-3 text-[14px] text-dt-ink-2">
          Day
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="h-10 rounded-xl border border-dt-line bg-dt-canvas px-3 text-[15px] text-dt-ink" />
          <span className="text-[13px] text-dt-ink-3">in {city(organiser)} time, the first row</span>
        </label>

        <ul className="mt-4 space-y-2">
          {rows.map((r, i) => (
            <li key={r.id} className="grid grid-cols-[1fr_auto] items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <input
                list="tz-list"
                value={r.zone}
                onChange={(e) => update(r.id, { zone: e.target.value })}
                aria-label={`Time zone ${i + 1}`}
                className="h-11 min-w-0 rounded-xl border border-dt-line bg-dt-canvas px-3 text-[15px] text-dt-ink"
              />
              <button
                type="button"
                onClick={() => setRows((rs) => rs.filter((x) => x.id !== r.id))}
                disabled={rows.length === 1}
                aria-label="Remove"
                className="grid size-11 place-items-center rounded-xl text-dt-ink-3 hover:bg-dt-sunken hover:text-dt-ink disabled:opacity-30 sm:order-last"
              >
                <X className="size-4" />
              </button>
              <div className="col-span-2 flex items-center gap-2 text-[14px] text-dt-ink-3 sm:col-span-1">
                <input type="time" value={r.from} onChange={(e) => update(r.id, { from: e.target.value })} aria-label="Starts work" className="h-11 rounded-xl border border-dt-line bg-dt-canvas px-2 text-[15px] text-dt-ink" />
                to
                <input type="time" value={r.to} onChange={(e) => update(r.id, { to: e.target.value })} aria-label="Stops work" className="h-11 rounded-xl border border-dt-line bg-dt-canvas px-2 text-[15px] text-dt-ink" />
              </div>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={() => setRows((rs) => [...rs, { id: Math.max(...rs.map((x) => x.id)) + 1, zone: "Asia/Kolkata", from: "09:00", to: "17:00" }])}
          disabled={rows.length >= 10}
          data-umami-event="tool-timezone-planner-use"
          data-umami-event-from="add"
          className="mt-3 inline-flex h-10 items-center gap-1.5 rounded-full border border-dt-line px-4 text-[14px] font-medium text-dt-ink hover:bg-dt-sunken disabled:opacity-40"
        >
          <Plus className="size-4" /> Add a person
        </button>
      </div>

      <div className="p-4 sm:p-6" aria-live="polite">
        {result && !result.ok && <p className="text-[14.5px] text-dt-held-ink">{result.message}</p>}
        {done && (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-[13px] text-dt-ink-3">
                  Everyone is working {pending && <Loader2 className="size-3.5 animate-spin" />}
                </div>
                <div className="mt-1 text-[1.6rem] font-semibold leading-tight tracking-[-0.02em] tabular-nums">
                  {done.overlap.length === 0
                    ? "No common hour"
                    : done.overlap.map((s) => `${range(s, organiser)}`).join(", ")}
                </div>
                <div className="mt-1 text-[14px] text-dt-ink-2">
                  {done.overlap.length === 0
                    ? "Widen someone's hours, or split the meeting."
                    : `${done.overlap.reduce((n, s) => n + hours(s), 0)} hours, in ${city(organiser)} time`}
                </div>
              </div>
              <button
                type="button"
                onClick={copy}
                data-umami-event="tool-timezone-planner-use"
                data-umami-event-from="copy"
                className="inline-flex h-10 items-center gap-1.5 rounded-full bg-dt-ink px-4 text-[14px] font-medium text-dt-on-ink hover:bg-dt-ink/85"
              >
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                {copied ? "Copied" : "Copy the times"}
              </button>
            </div>
            <Ribbons rows={rows} day={done.day} working={done.working} overlap={done.overlap} organiser={organiser} />
          </>
        )}
      </div>
    </div>
  );
}

function Ribbons({ rows, day, working, overlap, organiser }: { rows: readonly Row[]; day: Span; working: readonly (readonly Span[])[]; overlap: readonly Span[]; organiser: string }) {
  const len = day.end - day.start;
  const pct = (ms: number) => ((ms - day.start) / len) * 100;
  const ticks = [0, 6, 12, 18].map((h) => day.start + h * 3_600_000).filter((t) => t < day.end);

  return (
    <div className="mt-6">
      <div className="relative ml-0 h-5 sm:ml-36">
        {ticks.map((t) => (
          <span key={t} className="absolute -translate-x-1/2 text-[11.5px] tabular-nums text-dt-ink-3 first:translate-x-0" style={{ left: `${pct(t)}%` }}>
            {clock(t, organiser)}
          </span>
        ))}
      </div>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={r.id} className="sm:flex sm:items-center sm:gap-3">
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px] sm:mb-0 sm:block sm:w-33 sm:shrink-0">
              <span className="block truncate font-medium text-dt-ink">{city(r.zone)}</span>
              <span className="text-[12px] tabular-nums text-dt-ink-3">{overlap[0] ? range(overlap[0], r.zone) : `${r.from} to ${r.to}`}</span>
            </div>
            <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-dt-sunken">
              {(working[i] ?? []).map((s) => (
                <span key={s.start} className="absolute inset-y-0 bg-dt-ramp-3 dark:bg-dt-ramp-2/60" style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }} />
              ))}
              {overlap.map((s) => (
                <span key={s.start} className={cn("absolute inset-y-0 bg-dt-accent")} style={{ left: `${pct(s.start)}%`, width: `${pct(s.end) - pct(s.start)}%` }} />
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-4 text-[12px] text-dt-ink-3">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-dt-ramp-3 dark:bg-dt-ramp-2/60" /> Working
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-dt-accent" /> Everyone
        </span>
      </div>
    </div>
  );
}
