// The data model page: tenant, resource, timeline, and how the different kinds of time are stored
// on a timeline. Plain language, everyday examples, no jargon.

import { TimelineTrack } from "@/components/timeline-track";
import { LabeledTimeline, type TimelineRow } from "@/components/labeled-timeline";

// The same storage diagram in the richer "Why deltat" style (labeled, coloured boxes).
const STORAGE_ROWS: TimelineRow[] = [
  { label: "Open hours", boxes: [{ start: 6, end: 94, color: "zinc", text: "open" }] },
  { label: "Closed", boxes: [{ start: 44, end: 54, color: "rose", text: "Closed" }] },
  { label: "Booked", boxes: [{ start: 14, end: 28, color: "rose", text: "Booked" }, { start: 66, end: 78, color: "rose", text: "Booked" }] },
  {
    label: "Free",
    boxes: [
      { start: 28, end: 44, color: "emerald", text: "free" },
      { start: 54, end: 66, color: "emerald", text: "free" },
      { start: 78, end: 94, color: "emerald", text: "free" },
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

// One resource's timeline, showing the kinds of stretches that get stored, and the free gaps that
// deltat works out from them.
// Built from the same generic TimelineTrack the live demos use; the axis is just 0..100 here since
// it's illustrative. Same component, same look.
const AXIS = { axisStart: 0, axisEnd: 100, height: 16 } as const;

function StorageViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-4">
      <Row label="Open hours" hint="stored: when you may book">
        <TimelineTrack {...AXIS} bands={[{ start: 6, end: 94, tone: "neutral" }]} />
      </Row>
      <Row label="Closed" hint="stored: when you may not">
        <TimelineTrack {...AXIS} bands={[{ start: 44, end: 54, tone: "busy", label: "Closed" }]} />
      </Row>
      <Row label="Booked" hint="stored: time already taken">
        <TimelineTrack {...AXIS} bands={[{ start: 14, end: 28, tone: "busy" }, { start: 66, end: 78, tone: "busy" }]} />
      </Row>
      <Row label="Free" hint="not stored: worked out">
        <TimelineTrack
          {...AXIS}
          bands={[{ start: 28, end: 44, tone: "free" }, { start: 54, end: 66, tone: "free" }, { start: 78, end: 94, tone: "free" }]}
        />
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
      <div className="flex-1">{children}</div>
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
        and a fourth that deltat works out for you.
      </p>

      <div className="mt-4">
        <StorageViz />
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-zinc-500">Labeled-box style</div>
        <LabeledTimeline axisStart={0} axisEnd={100} rows={STORAGE_ROWS} />
      </div>

      <div className="mt-4 space-y-3 text-[13px] leading-relaxed text-zinc-400">
        <p>
          <span className="font-medium text-zinc-200">Open hours</span> are stored as rules: stretches
          that mark a resource open, like a clinic from 9am to 5pm.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Closed time</span> is stored as blocking rules:
          holidays, lunch, a day off, maintenance. They punch holes in the open hours.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Booked time</span> is stored as bookings. Each
          reservation is one stretch on the timeline, the slice of time it took. A hold is the same
          thing with a timer that frees it if nobody confirms.
        </p>
        <p>
          <span className="font-medium text-zinc-200">Free time</span> is the availability, and it is
          not stored at all. deltat takes the open hours, removes the blocking rules, removes the
          bookings and holds, and what is left is free. It works this out the instant you ask, so it
          can never go stale.
        </p>
      </div>
    </div>
  );
}
