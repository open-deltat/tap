"use client";

import { useState, type ReactNode } from "react";
import { CalendarDays, Database, RefreshCw } from "lucide-react";

// The objection every reader has: "my calendar already does that". Four things an agent asks,
// each answered twice: by a calendar (a list of events that gets copied around) and by Δt (a
// database that answers). The Δt column shows what the kernel and the MCP server do today.
type Question = {
  ask: string;
  calendar: { visual: ReactNode; note: string };
  deltat: { strip: StripState; lines: readonly { dir: "→" | "←"; text: string; tone?: "ok" | "refused" }[]; note: string };
};

type StripState = "free" | "held" | "booked" | "pushed";

const QUESTIONS: readonly Question[] = [
  {
    ask: "Is 14:30 free?",
    calendar: {
      visual: <EventList rows={[{ t: "09:00", label: "Standup" }, { t: "13:00", label: "Lunch, Ana" }, { t: "16:00", label: "School pickup" }]} />,
      note: "Here is the list. Work out the gaps yourself, and hope this copy is still current.",
    },
    deltat: {
      strip: "free",
      lines: [
        { dir: "→", text: "find_slots chen · Tue 14:00–16:00" },
        { dir: "←", text: "free 14:00–15:00, 15:30–16:00", tone: "ok" },
      ],
      note: "Computed on this read from what is booked right now. Never a cached copy.",
    },
  },
  {
    ask: "Keep it while I ask.",
    calendar: {
      visual: <EventList rows={[{ t: "13:00", label: "Lunch, Ana" }, { t: "14:30", label: "?", ghost: true }, { t: "16:00", label: "School pickup" }]} />,
      note: "There is no such thing as a hold. Book it now and cancel later, or offer a time you cannot keep.",
    },
    deltat: {
      strip: "held",
      lines: [
        { dir: "→", text: "hold_slot chen 14:30" },
        { dir: "←", text: "held · expires in 4:59", tone: "ok" },
      ],
      note: "Yours for minutes while the agent asks. It expires on its own; nobody can take it meanwhile.",
    },
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
      note: "Both writes land. Two bookings in one slot, and somebody finds out on the day.",
    },
    deltat: {
      strip: "booked",
      lines: [
        { dir: "→", text: "commit_hold · Agent A" },
        { dir: "←", text: "booked", tone: "ok" },
        { dir: "→", text: "commit_hold · Agent B" },
        { dir: "←", text: "CONFLICT · offers 15:00, 15:30", tone: "refused" },
      ],
      note: "One transaction. The storage engine refuses the second and hands back times that still work.",
    },
  },
  {
    ask: "Tell me when it changes.",
    calendar: {
      visual: <PollVisual />,
      note: "Ask again in five minutes. Every copy, on every site, is a little behind the truth.",
    },
    deltat: {
      strip: "pushed",
      lines: [
        { dir: "→", text: "LISTEN chen" },
        { dir: "←", text: "14:30 booked · pushed now", tone: "ok" },
      ],
      note: "Pushed the instant it is written, to every screen and agent that is listening.",
    },
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
              className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-medium transition-[background-color,border-color,color] duration-150 sm:h-10 ${
                active ? "border-dt-ink bg-dt-ink text-dt-on-ink" : "border-dt-line bg-dt-surface text-dt-ink-2 hover:border-dt-line-strong hover:text-dt-ink"
              }`}
            >
              <span className={`font-mono text-[11px] ${active ? "text-dt-on-ink/60" : "text-dt-ink-3"}`}>0{k + 1}</span>
              {it.ask}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" className="mt-5 grid gap-3 md:grid-cols-2">
        <Pane icon={<CalendarDays className="h-4 w-4" strokeWidth={1.75} />} title="A calendar" kind="A file that gets copied">
          {q.calendar.visual}
          <p className="mt-4 text-[14px] leading-relaxed text-dt-ink-2">{q.calendar.note}</p>
        </Pane>
        <Pane icon={<Database className="h-4 w-4" strokeWidth={1.75} />} title="Δt" kind="A database that answers" highlight>
          <Strip state={q.deltat.strip} />
          <div className="mt-3 space-y-1 font-mono text-[12.5px]">
            {q.deltat.lines.map((l) => (
              <div key={l.text} className={l.dir === "→" ? "text-dt-ink-2" : l.tone === "refused" ? "text-dt-held-ink" : "text-dt-accent-ink"}>
                {l.dir} {l.text}
              </div>
            ))}
          </div>
          <p className="mt-4 text-[14px] leading-relaxed text-dt-ink-2">{q.deltat.note}</p>
        </Pane>
      </div>
    </div>
  );
}

function Pane({ icon, title, kind, highlight, children }: { icon: ReactNode; title: string; kind: string; highlight?: boolean; children: ReactNode }) {
  return (
    <div className={`flex min-h-[272px] flex-col rounded-3xl border bg-dt-surface p-5 shadow-dt-surface sm:p-6 md:min-h-[300px] ${highlight ? "border-dt-accent/40" : "border-dt-line"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-[14px] font-semibold">
          <span className={`grid h-7 w-7 place-items-center rounded-lg ${highlight ? "bg-dt-accent-soft text-dt-accent-ink" : "bg-dt-sunken text-dt-ink-2"}`}>{icon}</span>
          {title}
        </div>
        <span className="text-[12px] text-dt-ink-3">{kind}</span>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </div>
  );
}

function EventList({ rows }: { rows: readonly { t: string; label: string; ghost?: boolean; clash?: boolean }[] }) {
  return (
    <div>
      <div className="flex items-center justify-between pb-1.5 text-[11.5px] text-dt-ink-3">
        <span>Tuesday</span>
        <span className="inline-flex items-center gap-1">
          <RefreshCw className="h-3 w-3" />
          copied 4 min ago
        </span>
      </div>
      <div className="divide-y divide-dt-line border-y border-dt-line">
        {rows.map((r, k) => (
          <div
            key={k}
            className={`flex items-center gap-3 py-2.5 text-[13px] ${
              r.ghost ? "text-dt-ink-3" : r.clash ? "text-dt-held-ink" : "text-dt-ink-2"
            }`}
          >
            <span className="w-11 shrink-0 font-mono text-[12px] tabular-nums">{r.t}</span>
            <span className={`truncate ${r.ghost ? "rounded-md border border-dashed border-dt-line-strong px-2" : ""}`}>{r.label}</span>
            {r.clash && <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-dt-held" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function PollVisual() {
  return (
    <div>
      <div className="flex items-center justify-between pb-1.5 text-[11.5px] text-dt-ink-3">
        <span>Tuesday</span>
        <span>copied 4 min ago</span>
      </div>
      <div className="divide-y divide-dt-line border-y border-dt-line">
        {["Your website", "The voice agent", "The booking app"].map((who, k) => (
          <div key={who} className="flex items-center justify-between py-2.5 text-[13px] text-dt-ink-2">
            <span>{who}</span>
            <span className="inline-flex items-center gap-1.5 font-mono text-[12px] tabular-nums text-dt-ink-3">
              <RefreshCw className="h-3 w-3" />
              next copy in {["4:12", "1:48", "0:31"][k]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// The same four slots the hero race uses, drawn in whichever state the question leaves them.
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
            {target && state === "held" && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-dt-surface bg-dt-accent" />}
            {target && state === "pushed" && (
              <span className="pointer-events-none absolute left-1/2 top-1/2 -ml-2 -mt-2 h-4 w-4 rounded-full bg-dt-accent/50">
                <span className="dt-radiate absolute inset-0 rounded-full bg-dt-accent/40" />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
