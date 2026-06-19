import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

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
