import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FeatureTopic {
  id: string;
  label: string; // sidebar
  title: string; // content heading
  tagline: string;
  body: string[];
  call: string; // the deltat operation
  demo?: { href: string; label: string };
  specId?: string;
}

// The non-interactive "how it works" topics — deltat's standout primitives, each one screen of
// plain-language explanation + the actual call + a pointer to the demo that exercises it.
export const FEATURE_TOPICS: FeatureTopic[] = [
  {
    id: "intersection",
    label: "Find a shared time",
    title: "Multi-resource intersection",
    tagline: "Find a time when everyone is free — in one read.",
    body: [
      "Each resource keeps its own independent timeline. To find when several are simultaneously free, deltat runs one sweep across all of them at once instead of fetching each calendar and intersecting in app code.",
      "min_available is the dial: set it to N (the count) and you get the strict intersection — every resource free. Set it to 1 and you get the union — a pool where any one will do. Anything in between means “at least k free”.",
    ],
    call: "getCombinedAvailability([a, b, c], start, end, min_available)",
    demo: { href: "/demos/meet", label: "Meet — two calendars, one slot" },
    specId: "AVAIL-08",
  },
  {
    id: "capacity",
    label: "Capacity & pools",
    title: "Capacity & pool booking",
    tagline: "Book K of N identical units, atomically.",
    body: [
      "A resource has a capacity, not a row per seat. The availability sweep tracks how much concurrent load a span carries, so booking 3 of 5 is accepted only if every instant in the span stays under capacity.",
      "That is one number standing in for thousands of fungible units — general-admission sections, a bar with N stools, a room type with N rooms — without modelling each one.",
    ],
    call: "batchBookSlots([...k rows]) → accepted iff load < capacity throughout",
    demo: { href: "/demos/stadium", label: "Stadium — 80k seats as capacities" },
    specId: "AVAIL-06",
  },
  {
    id: "atomic",
    label: "Atomic batches",
    title: "Atomic batch booking",
    tagline: "All rows commit, or none do.",
    body: [
      "A batch is all-or-nothing. If any row in the batch would conflict, the whole batch is rejected — there is never a partial booking to clean up.",
      "It holds across different resources too: a meeting that must land on two calendars, or a block of adjacent seats, either succeeds completely or leaves the world untouched.",
    ],
    call: "batchBookSlots([...rows]) — one transaction",
    demo: { href: "/demos/meet", label: "Meet — books both calendars at once" },
  },
  {
    id: "hierarchy",
    label: "Hierarchy & bubbling",
    title: "Hierarchy & event bubbling",
    tagline: "Subscribe once at the top, hear everything below.",
    body: [
      "Resources form a tree — stadium → tier → section → seat. A change on any node bubbles up to every ancestor, so a single LISTEN on the root streams events for the entire subtree.",
      "That is how the stadium keeps its “X of Y open” counts live across ~80,000 seats from one subscription, instead of opening a socket per section.",
    ],
    call: "events.listen(rootId) — receives every descendant's events",
    demo: { href: "/demos/stadium", label: "Stadium — live counts from one socket" },
  },
  {
    id: "stable-unit",
    label: "Stable-unit stays",
    title: "Stable-unit availability",
    tagline: "Same room for N nights — guaranteed, no search.",
    body: [
      "Because the capacity sweep is really interval-graph colouring, any span where load stays below capacity is guaranteed satisfiable on a single unit. The maths says one room can hold the whole run.",
      "So “5 consecutive nights in the same room” needs no per-room hunt — find a run where every night is under capacity and deltat lands it on one room. The hotel’s “longest stay” finder is exactly this.",
    ],
    call: "occupancy under capacity across the span ⇒ one stable unit",
    demo: { href: "/demos/hotel", label: "Hotel — soonest / longest-stay finders" },
    specId: "SYNC-01",
  },
  {
    id: "streaming",
    label: "Streaming",
    title: "Streaming · LISTEN / NOTIFY",
    tagline: "Push, never poll.",
    body: [
      "Every mutation emits a NOTIFY. Clients subscribed over a WebSocket receive the delta and repaint within a moment — no interval polling, no stale views.",
      "Open the same showtime in two tabs and book in one: the other updates on its own. The live demo shows one booker and three independent read-only viewers, all driven by the same stream.",
    ],
    call: "events.listen(resourceId, onEvent) — deltas over a socket",
    demo: { href: "/demos/live", label: "Live — one booker, three live viewers" },
    specId: "PROTO-01",
  },
];

function Track({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-10 shrink-0 text-right text-[9px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="relative h-3 flex-1 rounded bg-white/[0.04]">{children}</div>
    </div>
  );
}

function Seg({ left, width, cls }: { left: number; width: number; cls: string }) {
  return <div className={cn("absolute inset-y-0 rounded", cls)} style={{ left: `${left}%`, width: `${width}%` }} />;
}

const VizBox = ({ children }: { children: ReactNode }) => (
  <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">{children}</div>
);

// A compact diagram per primitive — the picture, not just the API.
function TopicVisual({ id }: { id: string }) {
  switch (id) {
    case "intersection":
      return (
        <VizBox>
          <div className="space-y-1.5">
            <Track label="Alice">
              <Seg left={10} width={45} cls="bg-zinc-500/40" />
              <Seg left={62} width={28} cls="bg-zinc-500/40" />
            </Track>
            <Track label="Bob">
              <Seg left={28} width={50} cls="bg-zinc-500/40" />
            </Track>
            <Track label="both">
              <Seg left={28} width={27} cls="bg-emerald-500/60" />
              <Seg left={62} width={16} cls="bg-emerald-500/60" />
            </Track>
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">the green band is where both are free</p>
        </VizBox>
      );
    case "capacity":
      return (
        <VizBox>
          <div className="flex gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className={cn("h-7 flex-1 rounded", i < 3 ? "bg-emerald-500/50" : "bg-white/[0.06]")} />
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">3 of 5 booked · accepted while load &lt; capacity</p>
        </VizBox>
      );
    case "atomic":
      return (
        <VizBox>
          <div className="flex items-center justify-center gap-2">
            {["A", "B", "C"].map((s) => (
              <div key={s} className="grid h-9 w-9 place-items-center rounded bg-emerald-500/40 text-[11px] font-medium text-emerald-100">
                {s}
              </div>
            ))}
            <span className="mx-1 text-zinc-600">or</span>
            {["A", "B", "C"].map((s) => (
              <div key={s} className="grid h-9 w-9 place-items-center rounded border border-white/10 text-[11px] text-zinc-600">
                {s}
              </div>
            ))}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">all three commit — or none do</p>
        </VizBox>
      );
    case "hierarchy":
      return (
        <VizBox>
          <div className="flex flex-col items-center gap-1 text-[9px] text-zinc-400">
            <div className="animate-pulse rounded bg-emerald-500/30 px-2 py-0.5 text-emerald-200">stadium ▲</div>
            <div className="h-2 w-px bg-white/15" />
            <div className="flex gap-6">
              <div className="rounded bg-white/[0.06] px-2 py-0.5">tier</div>
              <div className="rounded bg-white/[0.06] px-2 py-0.5">tier</div>
            </div>
            <div className="h-2 w-px bg-white/15" />
            <div className="rounded bg-sky-500/30 px-2 py-0.5 text-sky-200">seat booked</div>
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">a leaf event bubbles up to the root</p>
        </VizBox>
      );
    case "stable-unit":
      return (
        <VizBox>
          <div className="flex gap-1">
            {Array.from({ length: 10 }).map((_, i) => {
              const stay = i >= 2 && i <= 6;
              return <div key={i} className={cn("h-7 flex-1 rounded", stay ? "bg-emerald-500/55" : "bg-white/[0.06]")} />;
            })}
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">5 consecutive nights · one stable room</p>
        </VizBox>
      );
    case "streaming":
      return (
        <VizBox>
          <div className="flex items-center justify-between">
            <div className="relative grid h-9 w-16 place-items-center rounded bg-emerald-500/30 text-[10px] text-emerald-200">
              deltat
              <span className="absolute -right-1 -top-1 h-2 w-2 animate-ping rounded-full bg-emerald-400" />
            </div>
            <div className="mx-2 flex-1 border-t border-dashed border-emerald-400/30" />
            <div className="flex flex-col gap-1">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-2.5 w-10 rounded-full bg-sky-500/40" />
              ))}
            </div>
          </div>
          <p className="mt-2 text-center text-[10px] text-zinc-500">one NOTIFY → every subscriber repaints</p>
        </VizBox>
      );
    default:
      return null;
  }
}

export function TopicCard({ topic }: { topic: FeatureTopic }) {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">
        <span>{topic.label}</span>
        {topic.specId && (
          <span className="rounded border border-white/10 px-1 py-px font-mono text-[9px] tracking-normal">
            {topic.specId}
          </span>
        )}
      </div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">{topic.title}</h2>
      <p className="mt-1 text-sm text-emerald-300/90">{topic.tagline}</p>

      <div className="mt-5">
        <TopicVisual id={topic.id} />
      </div>

      <div className="mt-5 space-y-3">
        {topic.body.map((p, i) => (
          <p key={i} className="text-[13.5px] leading-relaxed text-zinc-400">
            {p}
          </p>
        ))}
      </div>

      <div className="mt-5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 font-mono text-[12px] text-emerald-200/90">
        {topic.call}
      </div>

      {topic.demo && (
        <Link
          href={topic.demo.href}
          className="mt-5 inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-[13px] font-medium text-emerald-200 transition-colors hover:bg-emerald-400/20"
        >
          See it live · {topic.demo.label}
          <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
