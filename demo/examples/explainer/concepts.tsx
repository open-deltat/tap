// Foundational "how it works" docs that sit right after the first page: the data model
// (tenant → resource → timeline) and a plain-language glossary of every deltat term.

function ConceptRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="text-sm font-semibold text-zinc-100">{term}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

// A nested picture: a tenant holds a tree of resources; each resource is its own timeline.
function ModelViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="rounded-md border border-emerald-400/20 bg-emerald-400/[0.04] p-3">
        <div className="mb-2 text-[10px] uppercase tracking-wider text-emerald-300/80">Tenant · &quot;Olympia&quot;</div>
        <div className="space-y-2">
          <div className="rounded border border-white/10 bg-white/[0.03] p-2">
            <div className="text-[11px] text-zinc-300">Resource · Stadium</div>
            <div className="mt-1.5 ml-3 space-y-1.5">
              <div className="rounded border border-white/10 bg-white/[0.03] p-1.5">
                <div className="text-[10px] text-zinc-400">Resource · Section 110</div>
                {/* the timeline of that resource */}
                <div className="relative mt-1 h-3 rounded bg-white/[0.04]">
                  <div className="absolute inset-y-0 left-[12%] w-[20%] rounded bg-rose-500/40" />
                  <div className="absolute inset-y-0 left-[55%] w-[15%] rounded bg-rose-500/40" />
                  <div className="absolute inset-y-0 left-[78%] w-[14%] rounded bg-emerald-500/50" />
                </div>
                <div className="mt-0.5 text-right text-[8.5px] text-zinc-600">↑ this resource&apos;s timeline</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DataModelTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Data model</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Tenant → Resource → Timeline</h2>
      <p className="mt-1 text-sm text-emerald-300/90">Three nested ideas. That&apos;s the whole shape of the data.</p>

      <div className="mt-5">
        <ModelViz />
      </div>

      <div className="mt-5 space-y-3">
        <ConceptRow term="Tenant — an isolated world">
          The outermost box (a database). Everything inside is private to it; nothing leaks across
          tenants. Think &quot;your company&quot;, or one event organiser. A deltat server holds many.
          <br />
          <span className="text-zinc-500">e.g. Olympia, Grand Hotel, Bella Cucina.</span>
        </ConceptRow>
        <ConceptRow term="Resource — a bookable thing">
          Anything you reserve: a seat, a room, a table, a doctor&apos;s calendar, a whole venue.
          Resources form a <span className="text-zinc-300">tree</span> — Stadium → Tier → Section →
          Seat — and there can be a huge number of them (a stadium is ~80,000 seat resources). A
          resource can also stand in for many identical units at once via its <em>capacity</em>.
          <br />
          <span className="text-zinc-500">e.g. &quot;Section 110&quot; (capacity 1,400), &quot;Suite&quot; (capacity 1), &quot;Alice&apos;s calendar&quot;.</span>
        </ConceptRow>
        <ConceptRow term="Timeline — the line of time on one resource">
          Each resource has its own number line of Unix time. Bookings, holds and rules are
          segments placed on it; a conflict is two segments overlapping on that one line. This is
          where all the collision maths happens — one resource at a time.
          <br />
          <span className="text-zinc-500">A booking from 7–9pm is just the segment [7pm, 9pm) on that resource&apos;s line.</span>
        </ConceptRow>
      </div>

      <p className="mt-5 text-[11px] text-zinc-500">
        So a query like &quot;is this seat free at 8pm?&quot; is one resource, one line, one overlap test —
        and &quot;find a time three people are all free&quot; is that same test run across three lines at once.
      </p>
    </div>
  );
}

const GLOSSARY: { term: string; def: string }[] = [
  { term: "Tenant", def: "An isolated database — its own private set of resources. Maps to a connection's database name." },
  { term: "Resource", def: "A bookable thing with its own timeline: a seat, room, table, calendar, or venue. Resources form a tree." },
  { term: "Timeline", def: "The Unix-time number line belonging to one resource, where its segments live." },
  { term: "Interval / Segment", def: "A half-open span [start, end) of Unix milliseconds — the atom everything is built from." },
  { term: "Instant", def: "A single i64-millisecond point on the line — a timestamp." },
  { term: "Booking", def: "A committed segment placed on a resource's timeline." },
  { term: "Hold", def: "A segment with a self-destruct timer (TTL) — a temporary reservation that subtracts from availability until it's confirmed or expires." },
  { term: "Rule", def: "A region of the line marked open or blocking — the resource's hours/closures that bound where bookings may land." },
  { term: "Conflict", def: "Two segments on the same resource that overlap (after buffers). The thing deltat exists to prevent." },
  { term: "Capacity", def: "How many segments may stack on the same instant of one resource — N identical units behind one id." },
  { term: "Buffer", def: "A forced gap appended after each segment (turnaround/cleaning) that counts toward conflict." },
  { term: "Availability", def: "The gaps left between everything already placed — open minus blocked minus booked minus held." },
  { term: "min_available", def: "The dial on a multi-resource query: N = all free (intersection), 1 = any free (pool), k = at least k free." },
  { term: "Batch", def: "A set of bookings committed all-or-nothing — no partial writes, even across resources." },
  { term: "Event bubbling", def: "A change on a resource is also emitted to all its ancestors, so one subscription on a parent hears the whole subtree." },
  { term: "LISTEN / NOTIFY", def: "The streaming channel: every mutation emits an event; subscribed clients get the delta over a socket, no polling." },
];

export function GlossaryTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Reference</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Glossary</h2>
      <p className="mt-1 text-sm text-emerald-300/90">Every word deltat uses, in one place.</p>

      <dl className="mt-5 space-y-2.5">
        {GLOSSARY.map((g) => (
          <div key={g.term} className="rounded-lg border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
            <dt className="text-[13px] font-semibold text-zinc-100">{g.term}</dt>
            <dd className="mt-0.5 text-[12.5px] leading-relaxed text-zinc-400">{g.def}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
