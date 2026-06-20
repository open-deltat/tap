// The first page: what deltat is, in plain language, using everyday examples.

// Three things booked on one line of time; two of them collide, one sits clear.
function CollisionViz() {
  const segs = [
    { label: "Flight", left: 8, width: 34, cls: "bg-sky-500/40 border-sky-400/40", row: 0 },
    { label: "Hotel", left: 30, width: 36, cls: "bg-rose-500/40 border-rose-400/40", row: 1 },
    { label: "Dinner", left: 72, width: 20, cls: "bg-emerald-500/40 border-emerald-400/40", row: 2 },
  ];
  return (
    <div className="relative h-32 overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]">
      <div className="absolute inset-y-0 left-[30%] w-[12%] bg-rose-500/10">
        <div className="absolute inset-x-0 top-1 text-center text-[8.5px] font-medium uppercase tracking-wider text-rose-300/80">
          they collide
        </div>
      </div>
      {/* the time axis: past on the left, future on the right */}
      <div className="absolute inset-x-3 top-1/2 flex -translate-y-1/2 items-center gap-1 text-zinc-500">
        <span className="text-[11px] leading-none">◀</span>
        <div className="h-px flex-1 bg-white/20" />
        <span className="text-[11px] leading-none">▶</span>
      </div>
      {segs.map((s) => (
        <div
          key={s.label}
          className={`absolute flex h-5 items-center justify-center rounded border text-[10px] text-zinc-100 ${s.cls}`}
          style={{ left: `${s.left}%`, width: `${s.width}%`, top: `${22 + s.row * 26}%` }}
        >
          {s.label}
        </div>
      ))}
      <div className="absolute bottom-1 left-3 text-[9px] text-zinc-500">past</div>
      <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-zinc-500">time</div>
      <div className="absolute bottom-1 right-3 text-[9px] text-zinc-500">future</div>
    </div>
  );
}

export function OverviewTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Start here</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">What deltat is</h2>
      <p className="mt-1 text-sm text-emerald-300/90">A small database that does one job: keep bookings from colliding.</p>

      <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
        <p>
          You know a database you can run yourself, like Postgres in a Docker container, or one you
          rent from a cloud provider. deltat is one of those. The difference is what it is built for.
          A normal database stores rows in tables. deltat stores time.
        </p>
        <p>
          Here is the whole idea. Picture one line that runs left to right, and that line is just
          time. A booking is a stretch on that line, like &quot;this room, 7pm to 9pm&quot;. Two bookings
          collide when their stretches cover the same moment. That is the entire model.
        </p>
      </div>

      <div className="mt-5">
        <CollisionViz />
      </div>

      <div className="mt-5 space-y-3 text-[13.5px] leading-relaxed text-zinc-400">
        <p>
          A flight, a hotel, and a dinner all sit on the same line. The flight and the hotel overlap,
          so they collide. The dinner is on its own, so it is fine. Checking a booking is really just
          asking &quot;does this stretch touch one that is already there?&quot;
        </p>
        <p>
          Most apps add booking on top of a database built for spreadsheets of rows, and it gets
          painful. deltat turns it around. Time is not one column among many. Time is the whole
          database. That keeps it tiny and quick, and it answers &quot;what is free?&quot; in well under a
          millisecond.
        </p>
      </div>

      <p className="mt-5 text-[11px] text-zinc-500">
        Next, the data model: how a booking, a blocked day, and free time all live on that one line.
      </p>
    </div>
  );
}
