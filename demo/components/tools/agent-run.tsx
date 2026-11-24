"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Loader2, Play, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { CallTrace } from "@/components/tools/call-trace";
import { runAgent, type AgentRun as Run } from "@/lib/tools/agent-actions";

const ASK = "Book me half an hour at the clinic, as early as you can today.";
const REVEAL_MS = 1100;

export function AgentRun() {
  const [rival, setRival] = useState(true);
  const [run, setRun] = useState<Run | null>(null);
  const [shown, setShown] = useState(0);
  const [pending, start] = useTransition();

  const steps = run?.ok ? run.steps : [];
  // The calls all happened before the reply arrived; revealing them one by one is only pacing, so a
  // reader can follow the agent's turn the way it unfolded.
  useEffect(() => {
    if (shown >= steps.length) return;
    const t = setTimeout(() => setShown((n) => n + 1), shown === 0 ? 200 : REVEAL_MS);
    return () => clearTimeout(t);
  }, [shown, steps.length]);

  const go = () =>
    start(async () => {
      setShown(0);
      setRun(await runAgent({ rival, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }));
    });

  const total = steps.reduce((n, s) => n + s.call.ms, 0);
  const finished = run?.ok && shown >= steps.length;

  return (
    <div className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <div className="flex flex-col gap-3 border-b border-dt-line p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[14.5px] text-dt-ink-2">
          <input type="checkbox" checked={rival} onChange={(e) => setRival(e.target.checked)} className="size-4 accent-[var(--dt-accent)]" />
          Another agent goes for the same time first
        </label>
        <button
          type="button"
          onClick={go}
          disabled={pending}
          data-umami-event="tool-agent-booking-use"
          data-umami-event-rival={String(rival)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-dt-ink px-6 text-[15px] font-semibold text-dt-on-ink transition-[background-color,transform] duration-150 hover:bg-dt-ink/85 active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          {run ? "Run it again" : "Run the agent"}
        </button>
      </div>

      <div className="space-y-5 p-4 sm:p-6" aria-live="polite">
        <Bubble who="person">{ASK}</Bubble>
        {!run && <p className="text-[14px] text-dt-ink-3">Press run. The agent makes real MCP calls to Δt; you see each one and the reply it read.</p>}
        {run && !run.ok && <p className="text-[14px] text-dt-held-ink">{run.message}</p>}
        {steps.slice(0, shown).map((s, i) => (
          <div key={i} className="dt-rise space-y-2.5">
            <Bubble who={s.call.who === "Agent" ? "agent" : "rival"}>{s.say}</Bubble>
            <CallTrace calls={[s.call]} />
          </div>
        ))}
        {finished && (
          <p className="dt-rise text-[13.5px] text-dt-ink-3">
            {steps.length} tool calls, {Math.round(total)} ms of tool time in all.{" "}
            {run.booked ? "The booking clears itself after 30 seconds." : "Nothing was booked this time: every time it tried was taken. Run it again."}
          </p>
        )}
      </div>
    </div>
  );
}

function Bubble({ who, children }: { who: "person" | "agent" | "rival"; children: React.ReactNode }) {
  const Icon = who === "person" ? User : Bot;
  return (
    <div className={cn("flex items-start gap-3", who === "person" && "flex-row-reverse")}>
      <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", who === "rival" ? "bg-dt-held-soft text-dt-held-ink" : "bg-dt-sunken text-dt-ink")}>
        <Icon className="size-4" aria-hidden />
      </span>
      <div className={cn("max-w-[60ch] rounded-2xl px-4 py-2.5 text-[14.5px] leading-relaxed", who === "person" ? "bg-dt-ink text-dt-on-ink" : "bg-dt-sunken text-dt-ink")}>
        {who !== "person" && <div className="mb-0.5 text-[11.5px] font-medium text-dt-ink-3">{who === "agent" ? "Agent" : "Another agent"} · scripted words</div>}
        {children}
      </div>
    </div>
  );
}
