// The data model page: tenant, resource, timeline, shown as a nesting, plus how time is stored.

import { cn } from "@/lib/utils";
import { LabeledTimeline, type TimelineRow } from "@/components/labeled-timeline";

// Open time, minus blocked, minus booked, equals free, read as one sum.
const STORAGE_ROWS: TimelineRow[] = [
  { label: "Open", boxes: [{ start: 6, end: 94, color: "zinc", text: "Open" }] },
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

// One box that contains the next, so the nesting reads at a glance: a tenant holds resources,
// resources hold resources, and the smallest one carries a timeline.
function Box({
  kind,
  name,
  accent,
  timeline,
  children,
}: {
  kind: string;
  name: string;
  accent?: boolean;
  timeline?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-md border p-2.5",
        accent ? "border-emerald-400/30 bg-emerald-500/[0.06]" : "border-white/10 bg-white/[0.02]"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-500">{kind}</div>
          <div className="text-[13px] font-medium text-zinc-100">{name}</div>
        </div>
        {timeline && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-[0.15em] text-emerald-300/70">timeline</span>
            <div className="flex h-3.5 w-20 overflow-hidden rounded-sm border border-white/10 sm:w-32">
              <div className="h-full bg-emerald-500/40" style={{ width: "38%" }} />
              <div className="h-full bg-rose-500/45" style={{ width: "24%" }} />
              <div className="h-full bg-emerald-500/40" style={{ width: "38%" }} />
            </div>
          </div>
        )}
      </div>
      {children && <div className="mt-2.5">{children}</div>}
    </div>
  );
}

function HierarchyViz() {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <Box kind="Tenant" name="Acme Tickets">
        <Box kind="Resource" name="Stadium">
          <Box kind="Resource" name="Section A">
            <Box kind="Resource" name="Seat 12" accent timeline />
          </Box>
        </Box>
      </Box>
    </div>
  );
}

export function DataModelTopic() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">Data model</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">Where everything lives</h2>
      <p className="mt-1 text-sm text-emerald-300/90">
        A tenant holds resources, resources can hold resources, and the smallest one has a timeline.
      </p>

      <div className="mt-5">
        <HierarchyViz />
      </div>

      <dl className="mt-4 space-y-1.5 text-[12.5px] leading-relaxed text-zinc-400">
        <div>
          <span className="font-medium text-zinc-200">Tenant</span> · your own private database. Nobody
          else sees inside it.
        </div>
        <div>
          <span className="font-medium text-zinc-200">Resource</span> · anything you can book. They can
          sit inside each other.
        </div>
        <div>
          <span className="font-medium text-zinc-200">Timeline</span> · each resource&apos;s own line of
          time, where bookings live.
        </div>
      </dl>

      <h3 className="mt-7 text-base font-semibold text-zinc-100">How time is stored</h3>
      <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
        Everything on a timeline is a labelled stretch. You store three kinds, and Δt works out the
        fourth: open time, minus blocked, minus booked, leaves what is free.
      </p>

      <div className="mt-4">
        <LabeledTimeline axisStart={0} axisEnd={100} rows={STORAGE_ROWS} />
        <div className="mt-2 text-center text-[10px] text-zinc-500">free is open, minus blocked, minus booked</div>
      </div>
    </div>
  );
}
