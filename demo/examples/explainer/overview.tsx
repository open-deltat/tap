// The "why deltat" first page — the first-principles framing straight from the project's premise:
// scheduling is collision detection in one dimension, and time is the whole database.

const PRIMITIVES: { term: string; def: string }[] = [
  { term: "Booking", def: "a segment placed on the timeline" },
  { term: "Conflict", def: "two segments that overlap" },
  { term: "Capacity", def: "how many segments may stack on one point" },
  { term: "Buffer", def: "a forced gap after a segment" },
  { term: "Rule", def: "a region of the line marked open or closed" },
  { term: "Hold", def: "a segment with a self-destruct timer" },
  { term: "Availability", def: "the gaps between everything already placed" },
];

// Three segments on one timeline; two of them overlap (a collision), one sits clear.
function CollisionViz() {
  const segs = [
    { label: "Flight", left: 8, width: 34, cls: "bg-sky-500/40 border-sky-400/40", row: 0 },
    { label: "Hotel", left: 30, width: 36, cls: "bg-rose-500/40 border-rose-400/40", row: 1 },
    { label: "Dentist", left: 72, width: 20, cls: "bg-emerald-500/40 border-emerald-400/40", row: 2 },
  ];
  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      {/* the collision band where Flight and Hotel overlap (30%..42%) */}
      <div className="absolute inset-y-0 left-[30%] w-[12%] bg-rose-500/10">
        <div className="absolute inset-x-0 top-1 text-center text-[8.5px] font-medium uppercase tracking-wider text-rose-300/80">
          collision
        </div>
      </div>
      {/* the number line */}
      <div className="absolute inset-x-3 top-1/2 h-px bg-white/15" />
      {segs.map((s) => (
        <div
          key={s.label}
          className={`absolute flex h-5 items-center justify-center rounded border text-[10px] text-zinc-100 ${s.cls}`}
          style={{ left: `${s.left}%`, width: `${s.width}%`, top: `${22 + s.row * 26}%` }}
        >
          {s.label}
        </div>
      ))}
    </div>
  );
}

export function OverviewTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">First principles</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Scheduling is collision detection</h2>
      <p className="mt-1 text-sm text-emerald-300/90">
        Time isn&apos;t a column in someone else&apos;s schema. It&apos;s the entire database.
      </p>

      <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
        <p>
          In a video game, a collision engine answers one question: do these two objects overlap?
          Scheduling is the same problem in one dimension. A booking is a segment on the number line
          of Unix time; two bookings conflict when their segments collide. That is the entire model.
        </p>
      </div>

      <div className="mt-5">
        <CollisionViz />
      </div>

      <p className="mt-5 text-[13.5px] leading-relaxed text-zinc-400">
        Everything else is an extension of that one primitive — overlap on a line:
      </p>

      <dl className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {PRIMITIVES.map((p) => (
          <div key={p.term} className="flex gap-2 text-[12.5px]">
            <dt className="w-24 shrink-0 font-medium text-zinc-200">{p.term}</dt>
            <dd className="text-zinc-400">{p.def}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 text-[13.5px] leading-relaxed text-zinc-400">
        Scheduling has historically been painful because it was bolted onto relational databases
        built for rows, not intervals. deltat inverts that: it operates purely on raw <code className="rounded bg-white/5 px-1 text-zinc-300">i64</code> Unix
        milliseconds — no time zones, no calendars, no business data — just segments on a number line,
        with sub-millisecond availability. Human-readable time is a display concern for the client.
      </p>

      <p className="mt-4 text-[11px] text-zinc-500">
        Pick a primitive from the left to see exactly how it works.
      </p>
    </div>
  );
}
