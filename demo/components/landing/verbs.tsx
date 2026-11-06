// The four calls an agent makes, in the order it makes them: the command the agent types is the
// title, the human word above it, one sentence under it. Each wears the colour its result has in
// the examples: green is free, amber is held, ink is booked, the live dot is a change arriving.
// Shared by the landing ("An agent can do four things.") and the docs, so the two never disagree.
export const VERBS = [
  { title: "Find", tool: "find_slots", chip: "bg-dt-accent-soft text-dt-accent-ink", body: "See what is free right now, across every calendar you name." },
  { title: "Hold", tool: "hold_slot", chip: "bg-dt-held-soft text-dt-held-ink", body: "Keep a slot for a few minutes while the agent asks. It lets go on its own." },
  { title: "Book", tool: "commit_hold", chip: "bg-dt-ink text-dt-on-ink", body: "Turn the hold into a booking in one step. If the slot is gone, Δt answers with times that still work." },
  { title: "Listen", tool: "LISTEN", chip: "border border-dt-line bg-dt-surface text-dt-ink", live: true, body: "Get told the moment anything changes, on every screen." },
] as const;

export function VerbChip({ verb }: { verb: (typeof VERBS)[number] }) {
  return (
    <code className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 font-mono text-[13.5px] ${verb.chip}`}>
      {"live" in verb && verb.live ? <span className="dt-breathe h-1.5 w-1.5 rounded-full bg-dt-accent" /> : <span className="opacity-50">›</span>}
      {verb.tool}
    </code>
  );
}

export function Verbs({ columns = 4 }: { columns?: 2 | 4 }) {
  return (
    <dl className={`grid gap-x-8 gap-y-8 sm:grid-cols-2 ${columns === 4 ? "lg:grid-cols-4" : ""}`}>
      {VERBS.map((v, i) => (
        <div key={v.title} className="border-t border-dt-line pt-4">
          <dt>
            <div className="text-[12.5px] text-dt-ink-3">
              <span className="font-mono">0{i + 1}</span> · {v.title}
            </div>
            <div className="mt-2">
              <VerbChip verb={v} />
            </div>
          </dt>
          <dd className="mt-3 text-[14.5px] leading-relaxed text-dt-ink-2">{v.body}</dd>
        </div>
      ))}
    </dl>
  );
}
