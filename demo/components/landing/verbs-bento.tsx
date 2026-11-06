import type { ReactNode } from "react";

// The four verbs of TAP, each with a picture of what it returns. Static on purpose: the hero race
// already moves, and the one loop here (Listen) is a picture of a stream, not an event.
export function VerbsBento() {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Tile n={1} title="Find" tool="find_slots" body="What is free right now, across every calendar you name. Computed on the read, never from a copy.">
        <FindVisual />
      </Tile>
      <Tile n={2} title="Hold" tool="hold_slot" body="The time is yours for minutes while the agent asks. It expires on its own; nobody can take it meanwhile.">
        <HoldVisual />
      </Tile>
      <Tile n={3} title="Commit" tool="commit_hold" body="The hold becomes a booking in one step. If it is gone, the refusal lists times that still work.">
        <RefusalCard />
      </Tile>
      <div className="grid gap-6 rounded-3xl border border-dt-line bg-dt-surface p-6 shadow-dt-surface lg:col-span-3 lg:grid-cols-[1fr_1.4fr] lg:items-center">
        <div>
          <Heading n={4} title="Listen" tool="LISTEN" />
          <p className="mt-2 text-[14.5px] leading-relaxed text-dt-ink-2">
            Every screen and agent hears the moment anything changes, and re-reads. Nobody polls, so no copy is ever behind.
          </p>
        </div>
        <ListenVisual />
      </div>
    </div>
  );
}

function Tile({ n, title, tool, body, children }: { n: number; title: string; tool: string; body: string; children: ReactNode }) {
  return (
    <div className="flex flex-col rounded-3xl border border-dt-line bg-dt-surface p-6 shadow-dt-surface">
      <div className="h-48">{children}</div>
      <div className="mt-5">
        <Heading n={n} title={title} tool={tool} />
      </div>
      <p className="mt-2 text-[14.5px] leading-relaxed text-dt-ink-2">{body}</p>
    </div>
  );
}

function Heading({ n, title, tool }: { n: number; title: string; tool: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-mono text-[12px] text-dt-ink-3">0{n}</span>
      <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
      <code className="font-mono text-[12px] text-dt-accent-ink">{tool}</code>
    </div>
  );
}

function FindVisual() {
  const slots = [
    { t: "13:30", state: "taken" },
    { t: "14:00", state: "free" },
    { t: "14:30", state: "free" },
    { t: "15:00", state: "taken" },
    { t: "15:30", state: "free" },
    { t: "16:00", state: "free" },
  ] as const;
  return (
    <div className="flex h-full flex-col justify-between">
      <div className="font-mono text-[12px] text-dt-ink-2">→ find_slots chen · Tue</div>
      <div className="grid grid-cols-3 gap-1.5">
        {slots.map((s) => (
          <div
            key={s.t}
            className={`rounded-xl border py-2 text-center text-[13px] tabular-nums ${
              s.state === "free" ? "border-dt-line bg-dt-surface font-medium text-dt-ink" : "border-transparent text-dt-ink-3/60 line-through"
            }`}
          >
            {s.t}
          </div>
        ))}
      </div>
      <div className="font-mono text-[12px] text-dt-accent-ink">← 4 free · computed now</div>
    </div>
  );
}

function HoldVisual() {
  // A hold is a promise with a clock. The ring is drawn almost full: the hold was just granted.
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex h-full items-center justify-center gap-6">
      <div className="relative h-24 w-24">
        <svg viewBox="0 0 80 80" className="h-24 w-24 -rotate-90">
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--dt-line-strong)" strokeWidth="4" />
          <circle cx="40" cy="40" r={r} fill="none" stroke="var(--dt-accent)" strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * 0.02} />
        </svg>
        <div className="absolute inset-0 grid place-items-center text-[17px] font-semibold tabular-nums">4:59</div>
      </div>
      <div className="font-mono text-[12px] leading-relaxed">
        <div className="text-dt-ink-2">→ hold_slot 14:30</div>
        <div className="text-dt-accent-ink">← held</div>
        <div className="mt-2 text-dt-ink-3">expires on its own</div>
      </div>
    </div>
  );
}

function RefusalCard() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b0f]">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="h-2 w-2 rounded-full bg-white/15" />
        <span className="ml-2 font-mono text-[11px] text-[#8b8b95]">commit_hold → refused</span>
      </div>
      <pre className="flex-1 overflow-x-auto p-3.5 font-mono text-[11.5px] leading-[1.55] text-[#e4e4e7]">
        <code>
          {"{\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;error&quot;</span>: <span className="text-[#6ee7b7]">&quot;CONFLICT&quot;</span>,{"\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;booked&quot;</span>: <span className="text-[#c4b5fd]">false</span>,{"\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;alternatives&quot;</span>: [{"\n"}
          {"    "}<span className="text-[#6ee7b7]">&quot;Tue, 3:00 pm&quot;</span>, <span className="text-[#6ee7b7]">&quot;Tue, 3:30 pm&quot;</span>{"\n"}
          {"  ],\n"}
          {"  "}<span className="text-[#7dd3fc]">&quot;next&quot;</span>: <span className="text-[#6ee7b7]">&quot;Offer one, then hold it.&quot;</span>{"\n"}
          {"}"}
        </code>
      </pre>
    </div>
  );
}

function ListenVisual() {
  const screens = ["Website", "Voice agent", "Booking app", "Dashboard"] as const;
  return (
    <div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-center">
      <div className="flex shrink-0 items-center gap-3 sm:w-36 sm:flex-col sm:gap-2">
        <span className="relative grid h-11 w-11 place-items-center">
          <span className="dt-radiate absolute inset-0 rounded-full bg-dt-accent/30" />
          <span className="dt-radiate absolute inset-0 rounded-full bg-dt-accent/30 [animation-delay:1.4s]" />
          <span className="relative h-3.5 w-3.5 rounded-full bg-dt-ink" />
        </span>
        <div className="text-[12.5px] leading-tight text-dt-ink-2 sm:text-center">
          <div className="font-medium text-dt-ink">one write</div>
          14:30 booked
        </div>
      </div>
      <div className="grid flex-1 grid-cols-2 divide-dt-line border-y border-dt-line sm:grid-cols-4 sm:divide-x">
        {screens.map((s) => (
          <div key={s} className="px-3 py-2.5 first:pl-0">
            <div className="text-[12px] text-dt-ink-3">{s}</div>
            <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium tabular-nums">
              <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" />
              14:30 taken
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
