// The data model page: tenant, resource, timeline, and how the different kinds of time are stored
// on a timeline. Plain language, everyday examples, no jargon.

function ConceptRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="text-sm font-semibold text-zinc-100">{term}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

// One resource's timeline, showing the kinds of stretches that get stored, and the free gaps that
// deltat works out from them.
function StorageViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <Row label="Open hours" hint="stored: when you may book">
        <span className="absolute inset-y-0 left-[6%] w-[88%] rounded bg-zinc-400/20 ring-1 ring-white/10" />
      </Row>
      <Row label="Closed" hint="stored: when you may not">
        <span className="absolute inset-y-0 left-[44%] w-[10%] rounded bg-red-500/45" />
      </Row>
      <Row label="Booked" hint="stored: time already taken">
        <span className="absolute inset-y-0 left-[14%] w-[14%] rounded bg-red-600/55" />
        <span className="absolute inset-y-0 left-[66%] w-[12%] rounded bg-red-600/55" />
      </Row>
      <Row label="Free" hint="not stored: worked out">
        <span className="absolute inset-y-0 left-[28%] w-[16%] rounded bg-emerald-500/55" />
        <span className="absolute inset-y-0 left-[54%] w-[12%] rounded bg-emerald-500/55" />
        <span className="absolute inset-y-0 left-[78%] w-[16%] rounded bg-emerald-500/55" />
      </Row>
      <div className="mt-2 text-center text-[10px] text-zinc-500">
        free time is open hours, minus closed, minus booked
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="w-16 shrink-0 text-right text-[10px] text-zinc-400">{label}</span>
      <span className="relative h-4 flex-1 rounded bg-white/[0.03]">{children}</span>
      <span className="hidden w-32 shrink-0 text-[9.5px] text-zinc-600 sm:block">{hint}</span>
    </div>
  );
}

export function DataModelTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Data model</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Where everything lives</h2>
      <p className="mt-1 text-sm text-emerald-300/90">Three nested ideas, and one timeline that holds the rest.</p>

      <div className="mt-5 space-y-3">
        <ConceptRow term="The database">
          The whole thing, the one you run or rent. Everything inside it is private to you. One
          company, one event company, one app. They never see each other&apos;s data.
        </ConceptRow>
        <ConceptRow term="A resource">
          Anything you can book. A seat, a hotel room, a restaurant table, a doctor, a whole venue.
          Resources can sit inside each other, like a stadium that holds sections that hold seats,
          and there can be a huge number of them.
          <br />
          <span className="text-zinc-500">A stadium is about 80,000 seats, each one a resource.</span>
        </ConceptRow>
        <ConceptRow term="A timeline">
          Every resource has its own line of time. Bookings and closures are stretches on that line.
          When you ask &quot;is this free at 8pm?&quot;, deltat looks at that one line and checks for overlap.
        </ConceptRow>
      </div>

      <h3 className="mt-7 text-base font-semibold text-zinc-100">How time is stored on a timeline</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
        Everything is just labelled stretches on the one line. There are only three kinds you store,
        and a fourth that deltat works out for you.
      </p>

      <div className="mt-4">
        <StorageViz />
      </div>

      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-zinc-400">
        <p>
          <span className="font-medium text-zinc-200">Open hours.</span> When a resource can be
          booked at all, like a clinic open 9am to 5pm. You store these as stretches that say &quot;you
          may book here&quot;.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Closed time.</span> Holidays, lunch, a day off,
          maintenance. Stored as stretches that say &quot;you may not book here&quot;, punched out of the open
          hours.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Booked time.</span> Someone&apos;s actual schedule.
          Each reservation is one stretch on the line, the slice of time it took.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Free time.</span> This one is not stored at all.
          deltat takes the open hours, removes the closed time, removes the bookings, and what is left
          is free. It works this out the instant you ask, so it can never go stale.
        </p>
      </div>
    </div>
  );
}
