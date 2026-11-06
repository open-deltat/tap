"use client";

import { useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";

// The objection every reader has: "my calendar already does that". Four things an agent asks, each
// answered twice: by a calendar (a list that gets copied around) and by Δt (a database that answers).
// One picture and one sentence per side; the Δt column shows what ships today.
type StripState = "free" | "held" | "booked" | "pushed";

type Question = {
  ask: string;
  calendar: { visual: ReactNode; note: string };
  deltat: { strip: StripState; note: string };
};

const QUESTIONS: readonly Question[] = [
  {
    ask: "Is 14:30 free?",
    calendar: {
      visual: <EventList rows={[{ t: "09:00", label: "Standup" }, { t: "13:00", label: "Lunch, Ana" }, { t: "16:00", label: "School pickup" }]} />,
      note: "Here is the list. Work out the gaps yourself.",
    },
    deltat: { strip: "free", note: "Free from 14:00 to 15:00. Worked out right now, not read off a copy." },
  },
  {
    ask: "Keep it for me.",
    calendar: {
      visual: <EventList rows={[{ t: "13:00", label: "Lunch, Ana" }, { t: "14:30", label: "?", ghost: true }, { t: "16:00", label: "School pickup" }]} />,
      note: "A calendar cannot keep a slot for you.",
    },
    deltat: { strip: "held", note: "Held for five minutes while the agent asks. Nobody else can take it." },
  },
  {
    ask: "Book it. Both of us.",
    calendar: {
      visual: (
        <EventList
          rows={[
            { t: "13:00", label: "Lunch, Ana" },
            { t: "14:30", label: "Agent A booked", clash: true },
            { t: "14:30", label: "Agent B booked", clash: true },
          ]}
        />
      ),
      note: "Both bookings go in. Two people, one slot.",
    },
    deltat: { strip: "booked", note: "One booking goes in. The other is refused and offered 15:00 or 15:30." },
  },
  {
    ask: "Tell me when it changes.",
    calendar: {
      visual: <PollVisual />,
      note: "Ask again in five minutes. Every copy runs a little behind.",
    },
    deltat: { strip: "pushed", note: "Everyone is told the moment it is written." },
  },
];

export function DifferenceModule() {
  const [i, setI] = useState(0);
  const q = QUESTIONS[i];

  return (
    <div>
      <div role="tablist" aria-label="What an agent asks" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
        {QUESTIONS.map((it, k) => {
          const active = k === i;
          return (
            <button
              key={it.ask}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => setI(k)}
              className={`inline-flex h-11 shrink-0 items-center rounded-full border px-4 text-[14px] font-medium transition-[background-color,border-color,color] duration-150 sm:h-10 ${
                active ? "border-dt-ink bg-dt-ink text-dt-on-ink" : "border-dt-line bg-dt-surface text-dt-ink-2 hover:border-dt-line-strong hover:text-dt-ink"
              }`}
            >
              {it.ask}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-5 grid gap-3 md:grid-cols-2">
        <Pane
          title="A calendar"
          aside={
            <span className="inline-flex items-center gap-1">
              <RefreshCw className="h-3 w-3" />
              copied 4 min ago
            </span>
          }
        >
          {q.calendar.visual}
          <p className="mt-4 text-[14.5px] leading-relaxed text-dt-ink-2">{q.calendar.note}</p>
        </Pane>
        <Pane
          title="Δt"
          aside={
            <span className="inline-flex items-center gap-1.5">
              <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
              live
            </span>
          }
          highlight
        >
          <Strip state={q.deltat.strip} />
          <p className="mt-4 text-[14.5px] leading-relaxed text-dt-ink-2">{q.deltat.note}</p>
        </Pane>
      </div>
    </div>
  );
}

function Pane({ title, aside, highlight, children }: { title: string; aside: ReactNode; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-h-[248px] flex-col rounded-3xl border bg-dt-surface p-5 shadow-dt-surface sm:p-6 ${highlight ? "border-dt-accent/40" : "border-dt-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-[14px] font-semibold">{title}</div>
        <span className="text-[12px] text-dt-ink-3">{aside}</span>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

function EventList({ rows }: { rows: readonly { t: string; label: string; ghost?: boolean; clash?: boolean }[] }) {
  return (
    <div className="divide-y divide-dt-line border-y border-dt-line">
      {rows.map((r, k) => (
        <div key={k} className={`flex items-center gap-3 py-2.5 text-[13px] ${r.ghost ? "text-dt-ink-3" : r.clash ? "text-dt-held-ink" : "text-dt-ink-2"}`}>
          <span className="w-11 shrink-0 font-mono text-[12px] tabular-nums">{r.t}</span>
          <span className={`truncate ${r.ghost ? "rounded-md border border-dashed border-dt-line-strong px-2" : ""}`}>{r.label}</span>
          {r.clash && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-dt-held" />}
        </div>
      ))}
    </div>
  );
}

function PollVisual() {
  const copies = [
    { who: "Your website", next: "4:12" },
    { who: "The voice agent", next: "1:48" },
    { who: "The booking app", next: "0:31" },
  ] as const;
  return (
    <div className="divide-y divide-dt-line border-y border-dt-line">
      {copies.map((c) => (
        <div key={c.who} className="flex items-center justify-between py-2.5 text-[13px] text-dt-ink-2">
          <span>{c.who}</span>
          <span className="inline-flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-dt-ink-3">
            <RefreshCw className="h-3 w-3" />
            next copy in {c.next}
          </span>
        </div>
      ))}
    </div>
  );
}

// The same slots the hero race uses, drawn in whichever state the question leaves them.
function Strip({ state }: { state: StripState }) {
  const slots = ["14:00", "14:30", "15:00", "15:30"] as const;
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {slots.map((t) => {
        const target = t === "14:30";
        const dark = target && state !== "free";
        const offered = state === "booked" && (t === "15:00" || t === "15:30");
        return (
          <div
            key={t}
            className={`relative rounded-xl border py-2.5 text-center text-[13px] tabular-nums ${
              dark ? "border-dt-ink bg-dt-ink font-semibold text-dt-on-ink" : "border-dt-line bg-dt-surface font-medium text-dt-ink-2"
            } ${offered ? "border-dt-accent ring-1 ring-inset ring-dt-accent" : ""}`}
          >
            {t}
            {target && state !== "free" && (
              <span className={`absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dt-surface bg-dt-accent ${state === "pushed" ? "dt-breathe" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
