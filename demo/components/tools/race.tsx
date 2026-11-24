"use client";

import { useState, useTransition } from "react";
import { Loader2, Swords, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { CallTrace } from "@/components/tools/call-trace";
import { runRace, type RaceResult, type Racer } from "@/lib/tools/race-actions";
import type { Call } from "@/lib/tools/trace";

const timeFmt = (ms: number) => new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(ms);

/** The alternatives a refused hold carried, as the SDK parsed them. */
function offered(call: Call | undefined): number[] {
  if (!call || call.outcome.ok) return [];
  const reply = call.outcome.reply;
  if (typeof reply !== "object" || reply === null || !("alternatives" in reply) || !Array.isArray(reply.alternatives)) return [];
  return reply.alternatives.flatMap((a: unknown) => (typeof a === "object" && a !== null && "start" in a && typeof a.start === "number" ? [a.start] : []));
}

export function DoubleBookingRace() {
  const [result, setResult] = useState<RaceResult | null>(null);
  const [rounds, setRounds] = useState<Record<Racer, number>>({ A: 0, B: 0 });
  const [pending, start] = useTransition();

  const race = () =>
    start(async () => {
      const r = await runRace();
      setResult(r);
      if (r.ok && r.winner) {
        const w = r.winner;
        setRounds((s) => ({ ...s, [w]: s[w] + 1 }));
      }
    });

  const done = result?.ok ? result : null;

  return (
    <div className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <div className="flex flex-col items-center gap-3 border-b border-dt-line px-5 py-6 text-center sm:px-8">
        <div className="text-[13px] text-dt-ink-3">
          {done ? `The slot: ${timeFmt(done.slot.start)} to ${timeFmt(done.slot.end)}, on a live Δt calendar` : "One half-hour slot on a live Δt calendar. Two bookers want it."}
        </div>
        <button
          type="button"
          onClick={race}
          disabled={pending}
          data-umami-event="tool-double-booking-race-use"
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-dt-ink px-7 text-[15px] font-semibold text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
          {done ? "Race again" : "Start the race"}
        </button>
        {result && !result.ok && <p className="text-[14px] text-dt-held-ink">{result.message}</p>}
        {done && !done.winner && (
          <p className="text-[14px] text-dt-held-ink">Neither got it: another visitor&apos;s race held this slot a moment earlier. Run it again.</p>
        )}
      </div>

      <div className="grid divide-y divide-dt-line sm:grid-cols-2 sm:divide-x sm:divide-y-0">
        {(["A", "B"] as const).map((who) => (
          <Lane key={who} who={who} result={done} wins={rounds[who]} />
        ))}
      </div>

      {done && (
        <details className="group border-t border-dt-line bg-dt-canvas/60 px-4 py-4 sm:px-6">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14px] font-medium text-dt-ink-2 hover:text-dt-ink">
            <span className="transition-transform group-open:rotate-90">›</span>
            Every call, as it was sent and answered ({done.calls.length})
          </summary>
          <CallTrace calls={done.calls} className="mt-3" />
        </details>
      )}
    </div>
  );
}

function Lane({ who, result, wins }: { who: Racer; result: Extract<RaceResult, { ok: true }> | null; wins: number }) {
  const mine = result?.calls.filter((c) => c.who === `Booker ${who}`) ?? [];
  const read = mine.find((c) => c.kind === "find");
  const hold = mine.find((c) => c.kind === "hold");
  const won = result?.winner === who;
  const alternatives = offered(hold);

  return (
    <div className={cn("relative px-5 py-6 transition-colors sm:px-7", won && "bg-dt-accent-soft/50")}>
      <div className="flex items-center justify-between">
        <div className="text-[15px] font-semibold">Booker {who}</div>
        <div className="text-[12.5px] tabular-nums text-dt-ink-3">
          {wins} {wins === 1 ? "win" : "wins"}
        </div>
      </div>
      <ol className="mt-4 space-y-3 text-[14.5px]">
        <Row n={1} label="Reads the slot" state={read ? (read.outcome.ok ? "Free" : "Error") : null} tone="free" ms={read?.ms} />
        <Row
          n={2}
          label="Holds it"
          state={hold ? (hold.outcome.ok ? "Held" : hold.outcome.code) : null}
          tone={hold?.outcome.ok ? "held" : "lost"}
          ms={hold?.ms}
        />
      </ol>
      <div className="mt-5 min-h-12 text-[14px] leading-relaxed">
        {!result && <span className="text-dt-ink-3">Waiting for the start.</span>}
        {result && won && (
          <span className="dt-rise inline-flex items-center gap-2 font-medium text-dt-accent-ink">
            <Trophy className="h-4 w-4" /> Got the slot. Sent {result.firstSent === who ? "first" : "second"}.
          </span>
        )}
        {result && !won && (
          <span className="dt-rise text-dt-ink-2">
            Saw it free, lost the hold. Sent {result.firstSent === who ? "first" : "second"}.
            {alternatives.length > 0 && <> Δt offered {alternatives.map(timeFmt).join(", ")} in the same reply.</>}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ n, label, state, tone, ms }: { n: number; label: string; state: string | null; tone: "free" | "held" | "lost"; ms?: number }) {
  return (
    <li className="flex items-center gap-3">
      <span className="font-mono text-[12px] text-dt-ink-3">0{n}</span>
      <span className="flex-1 text-dt-ink-2">{label}</span>
      {state ? (
        <span
          className={cn(
            "dt-rise rounded-full px-2.5 py-0.5 font-mono text-[12px] font-medium",
            tone === "free" && "bg-dt-accent-soft text-dt-accent-ink",
            tone === "held" && "bg-dt-held-soft text-dt-held-ink",
            tone === "lost" && "border border-dt-held/50 text-dt-held-ink"
          )}
        >
          {state}
          {ms !== undefined && <span className="ml-1.5 opacity-60">{ms} ms</span>}
        </span>
      ) : (
        <span className="h-5 w-14 rounded-full bg-dt-sunken" />
      )}
    </li>
  );
}
