"use client";

import { useState, useTransition } from "react";
import { Loader2, Play, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { CallTrace } from "@/components/tools/call-trace";
import { consoleStep } from "@/lib/tools/console-actions";
import type { Call } from "@/lib/tools/trace";

type Phase =
  | { at: "find" }
  | { at: "hold"; start: number }
  | { at: "held"; start: number; holdId: string }
  | { at: "booked" };

const timeFmt = (ms: number) => new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" }).format(ms);
const iso = (ms: number) => new Date(ms).toISOString();

function replyField(call: Call, key: string): unknown {
  const r = call.outcome.reply;
  return typeof r === "object" && r !== null && key in r ? (r as Record<string, unknown>)[key] : undefined;
}

const HALF_HOUR = 1_800_000;

/** The first half hour, on a half-hour boundary, that fits wholly inside a free stretch find returned. */
function firstStart(call: Call): number | null {
  if (!call.outcome.ok || !Array.isArray(call.outcome.reply)) return null;
  const spans = call.outcome.reply.flatMap((s: unknown) =>
    typeof s === "object" && s !== null && "start" in s && "end" in s && typeof s.start === "number" && typeof s.end === "number" ? [{ start: s.start, end: s.end }] : []
  );
  const fit = spans.map((s) => ({ at: Math.ceil(s.start / HALF_HOUR) * HALF_HOUR, end: s.end })).find((s) => s.at + HALF_HOUR <= s.end);
  return fit?.at ?? null;
}

const STEPS = ["find", "hold", "commit"] as const;

export function ApiConsole() {
  const [phase, setPhase] = useState<Phase>({ at: "find" });
  const [calls, setCalls] = useState<Call[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (input: Parameters<typeof consoleStep>[0], next: (call: Call) => Phase | null) =>
    start(async () => {
      const r = await consoleStep(input);
      if (!r.ok) {
        // Refused before reaching Δt (a stale time, the rate limit): start again from a fresh find.
        setPhase({ at: "find" });
        return setError(r.message);
      }
      setError(null);
      setCalls((cs) => [r.call, ...cs]);
      const p = next(r.call);
      if (p) setPhase(p);
    });

  const code = (() => {
    switch (phase.at) {
      case "find":
        return `const free = await dt.availability.get({\n  resourceId: calendar,\n  start: Date.now(),\n  end: Date.now() + 4 * HOUR,\n  minDuration: 30 * MINUTE,\n});`;
      case "hold":
        return `const hold = await dt.holds.place({\n  resourceId: calendar,\n  start: Date.parse("${iso(phase.start)}"),\n  end: Date.parse("${iso(phase.start + HALF_HOUR)}"),\n  expiresAt: Date.now() + 60_000, // lets go on its own\n});`;
      case "held":
        return `// Nobody else can take ${timeFmt(phase.start)} now. Confirm it:\nconst { bookingId } = await dt.holds.commit("${phase.holdId}");`;
      case "booked":
        return `// Booked, in one step, with no moment where the slot was free in between.`;
    }
  })();

  const stepIndex = phase.at === "find" ? 0 : phase.at === "hold" ? 1 : 2;

  return (
    <div className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <ol className="flex border-b border-dt-line text-[13px]">
        {STEPS.map((s, i) => (
          <li key={s} className={cn("flex flex-1 items-center gap-2 px-4 py-3 sm:px-6", i > 0 && "border-l border-dt-line", i === stepIndex && phase.at !== "booked" ? "font-semibold text-dt-ink" : "text-dt-ink-3")}>
            <span className="font-mono">0{i + 1}</span> {s === "find" ? "Find" : s === "hold" ? "Hold" : "Commit"}
          </li>
        ))}
      </ol>

      <div className="grid gap-px bg-dt-line lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="bg-dt-surface p-4 sm:p-6">
          <div className="lg:sticky lg:top-6">
          <pre className="min-h-40 whitespace-pre-wrap break-words rounded-2xl bg-[#0b0b0f] p-4 font-mono text-[12.5px] leading-relaxed text-[#e4e4e7]">
            <code>{code}</code>
          </pre>
          <div className="mt-4 flex flex-wrap gap-2">
            {phase.at === "find" && (
              <RunButton pending={pending} label="Run find" onClick={() => run({ step: "find" }, (c) => { const s = firstStart(c); return s ? { at: "hold", start: s } : null; })} />
            )}
            {phase.at === "hold" && (
              <RunButton
                pending={pending}
                label={`Hold ${timeFmt(phase.start)}`}
                onClick={() =>
                  run({ step: "hold", start: phase.start, who: "you" }, (c) => {
                    const id = replyField(c, "id");
                    return c.outcome.ok && typeof id === "string" ? { at: "held", start: phase.start, holdId: id } : null;
                  })
                }
              />
            )}
            {phase.at === "held" && (
              <>
                <RunButton
                  pending={pending}
                  label="Commit"
                  onClick={() => run({ step: "commit", holdId: phase.holdId }, (c) => (c.outcome.ok ? { at: "booked" } : { at: "find" }))}
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run({ step: "hold", start: phase.start, who: "someone-else" }, () => null)}
                  className="inline-flex h-11 items-center rounded-full border border-dt-line-strong px-4 text-[14px] font-medium text-dt-ink hover:bg-dt-sunken disabled:opacity-50"
                >
                  Let someone else try it
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run({ step: "release", holdId: phase.holdId }, () => ({ at: "find" }))}
                  className="inline-flex h-11 items-center rounded-full px-4 text-[14px] font-medium text-dt-ink-2 hover:bg-dt-sunken disabled:opacity-50"
                >
                  Release
                </button>
              </>
            )}
            {phase.at === "booked" && (
              <button
                type="button"
                onClick={() => setPhase({ at: "find" })}
                className="inline-flex h-11 items-center gap-2 rounded-full border border-dt-line-strong px-4 text-[14px] font-medium text-dt-ink hover:bg-dt-sunken"
              >
                <RotateCcw className="size-4" /> Start over
              </button>
            )}
          </div>
          <p className="mt-3 text-[13px] leading-relaxed text-dt-ink-3">
            {phase.at === "booked"
              ? "That booking is real, on a live Δt calendar. It clears itself after 30 seconds, like every booking in the demos."
              : phase.at === "held"
                ? "The hold lasts 60 seconds. Let someone else try for the same time to see the refusal they get."
                : "Runs on a demo calendar on the live Δt. Nothing to install."}
          </p>
          {error && <p className="mt-2 text-[14px] text-dt-held-ink">{error}</p>}
          </div>
        </div>

        <div className="min-w-0 bg-dt-canvas/60 p-4 sm:p-6">
          <div className="mb-3 text-[13px] font-medium text-dt-ink-2">Replies, newest first</div>
          {calls.length === 0 ? (
            <div className="grid min-h-40 place-items-center rounded-2xl border border-dashed border-dt-line-strong text-[14px] text-dt-ink-3">Run a step to see what Δt sends back.</div>
          ) : (
            <CallTrace calls={calls} stacked />
          )}
        </div>
      </div>
    </div>
  );
}

function RunButton({ label, pending, onClick }: { label: string; pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      data-umami-event="tool-api-console-use"
      data-umami-event-step={label.split(" ")[0]?.toLowerCase()}
      className="inline-flex h-11 items-center gap-2 rounded-full bg-dt-ink px-5 text-[14px] font-semibold text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.98] disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
      {label}
    </button>
  );
}
