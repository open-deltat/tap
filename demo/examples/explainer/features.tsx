"use client";

import { ArrowRight } from "lucide-react";
import { enabledExamples } from "@/examples/manifest";
import type { ExampleId } from "@/examples/config";

// What the one idea (time on a line) actually lets you build. Each card is a capability in plain
// words, linking to the live demo that shows it. Copy verified against the spec + each demo.
const FEATURES: { key: string; title: string; blurb: string; demoId: ExampleId }[] = [
  {
    key: "collision",
    title: "Stop double bookings",
    blurb: "Every booking is a block on the line, so two people can never grab the very same seat.",
    demoId: "cinema",
  },
  {
    key: "holds",
    title: "Hold a spot live",
    blurb: "Save a seat while someone makes up their mind, and it lets go on its own if they never say yes.",
    demoId: "live",
  },
  {
    key: "capacity",
    title: "Book up to a limit",
    blurb: "Let many bookings share the same time on one thing, and stop new ones once it hits the limit.",
    demoId: "parking",
  },
  {
    key: "multiday",
    title: "Book nights in a row",
    blurb: "Pick a room and a run of nights, and it books them as one stay without ever overbooking the room.",
    demoId: "hotel",
  },
  {
    key: "hierarchy",
    title: "Put things inside things",
    blurb: "Build a stadium that holds tiers that hold sections, and open hours flow down to every seat.",
    demoId: "stadium",
  },
  {
    key: "availability",
    title: "See what time is free",
    blurb: "Take the open hours, remove the busy time, and instantly see the slots that are still free.",
    demoId: "availability",
  },
  {
    key: "intersection",
    title: "Find a shared time",
    blurb: "Look at several calendars at once and show the times when everyone is free together.",
    demoId: "meet",
  },
  {
    key: "atomic",
    title: "Book it all together",
    blurb: "Reserve several things in one move, and if even one is taken, none of them get booked.",
    demoId: "rules",
  },
  {
    key: "recurrence",
    title: "Set weekly hours",
    blurb: "Set your open hours once for the week, and Δt turns them into real blocks people can book.",
    demoId: "builder",
  },
];

export function FeaturesTopic() {
  const byId = new Map(enabledExamples().map((e) => [e.id, e]));

  return (
    <div className="mx-auto max-w-2xl">
      <div className="text-[10.5px] uppercase tracking-[0.2em] text-zinc-500">What you can build</div>
      <h2 className="mt-2 text-2xl font-semibold text-zinc-100">One idea, many features</h2>
      <p className="mt-1 text-sm text-emerald-300/90">
        It is all the same trick, time on a line, turned into things you can build. Each one links to a
        live demo.
      </p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {FEATURES.map((f) => {
          const demo = byId.get(f.demoId);
          if (!demo) return null;
          const Icon = demo.icon;
          return (
            <a
              key={f.key}
              href={demo.href}
              className="group flex flex-col rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 transition-colors hover:border-emerald-400/30 hover:bg-white/[0.04]"
            >
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-emerald-400/10 text-emerald-300">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="text-[13px] font-semibold text-zinc-100">{f.title}</div>
              </div>
              <p className="mt-2 flex-1 text-[12px] leading-relaxed text-zinc-400">{f.blurb}</p>
              <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-300/80 transition-colors group-hover:text-emerald-200">
                See it in {demo.label}
                <ArrowRight className="h-3 w-3" />
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
