// The data model page: tenant, resource, timeline, and how the different kinds of time are stored
// on a timeline. Plain language, everyday examples, no jargon.

import { LabeledTimeline, type TimelineRow } from "@/components/labeled-timeline";

// The storage diagram as one equation: availability, minus blocked, minus booked, equals free.
const STORAGE_ROWS: TimelineRow[] = [
  { label: "Availability", boxes: [{ start: 6, end: 94, color: "zinc", text: "Availability" }] },
  { op: "−", label: "Blocked", boxes: [{ start: 44, end: 54, color: "rose", text: "Blocked" }] },
  {
    op: "−",
    label: "Booked",
    boxes: [
      { start: 14, end: 28, color: "rose", text: "Booked" },
      { start: 66, end: 78, color: "rose", text: "Booked" },
    ],
  },
  {
    op: "=",
    divider: true,
    label: "Free",
    boxes: [
      { start: 28, end: 44, color: "emerald", text: "Free" },
      { start: 54, end: 66, color: "emerald", text: "Free" },
      { start: 78, end: 94, color: "emerald", text: "Free" },
    ],
  },
];

function ConceptRow({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <div className="text-sm font-semibold text-zinc-100">{term}</div>
      <div className="mt-1 text-[13px] leading-relaxed text-zinc-400">{children}</div>
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
        <ConceptRow term="Tenant">
          Your own private database, the one you run or rent. We call it a tenant. Everything inside
          it is private to you. One company, one event company, one app. They never see each
          other&apos;s data.
        </ConceptRow>
        <ConceptRow term="Resource">
          Anything you can book. A seat, a hotel room, a restaurant table, a doctor, a whole venue.
          A resource can sit inside another, like a stadium that holds sections that hold seats, and
          there can be a huge number of them.
          <br />
          <span className="text-zinc-500">A stadium is about 80,000 seats, each one a resource.</span>
        </ConceptRow>
        <ConceptRow term="Timeline">
          Every resource has its own line of time, its timeline. Rules and bookings are stretches on
          that timeline. When you ask &quot;is this free at 8pm?&quot;, deltat looks at that one timeline and
          checks for overlap.
        </ConceptRow>
      </div>

      <h3 className="mt-7 text-base font-semibold text-zinc-100">How time is stored on a timeline</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
        Everything is just labelled stretches on the timeline. There are only three kinds you store,
        and a fourth that deltat works out for you. Read it as a sum: availability, minus blocked time,
        minus what is booked, and what is left is free.
      </p>

      <div className="mt-4">
        <LabeledTimeline axisStart={0} axisEnd={100} rows={STORAGE_ROWS} />
        <div className="mt-2 text-center text-[10px] text-zinc-500">
          free time is availability, minus blocked, minus booked
        </div>
      </div>

      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-zinc-400">
        <p>
          <span className="font-medium text-zinc-200">Availability</span> is stored as rules: stretches
          that mark when a resource is open, like a clinic from 9am to 5pm.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Blocked time</span> is stored as blocking rules:
          holidays, lunch, a day off, maintenance. They punch holes in the availability.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Booked time</span> is stored as bookings. Each
          reservation is one stretch on the timeline, the slice of time it took. A hold is the same
          thing with a timer that frees it if nobody confirms.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Free time</span> is what is left, and it is
          not stored at all. deltat takes the availability, removes the blocking rules, removes the
          bookings and holds, and what is left is free. It works this out the instant you ask, so it
          can never go stale.
        </p>
      </div>
    </div>
  );
}
