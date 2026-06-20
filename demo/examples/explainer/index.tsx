"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { HoldsStatic } from "./holds/holds-static";
import { OverviewTopic } from "./overview";
import { DataModelTopic } from "./concepts";

// The "How it works" landing: a short first-principles intro, the data model, and the holds/races
// story. Live availability, recurrence, and multi-night live in their own runnable examples now.
const NAV: { id: string; label: string }[] = [
  { id: "overview", label: "Why deltat" },
  { id: "model", label: "Data model" },
  { id: "holds", label: "Holds and races" },
];

export default function ExplainerExample() {
  const [topic, setTopic] = useState<string>("overview");

  let content: ReactNode;
  if (topic === "model") content = <DataModelTopic />;
  else if (topic === "holds") content = <HoldsStatic />;
  else content = <OverviewTopic />;

  return (
    <div className="relative h-full overflow-hidden bg-[#0a0a0c] text-zinc-100">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[55vh] w-[55vh] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[130px]" />
        <div className="absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle,#ffffff_1px,transparent_1px)] [background-size:22px_22px]" />
      </div>

      <div className="relative mx-auto flex h-full max-w-6xl gap-4 px-4 py-6 sm:gap-6 sm:px-6">
        <aside className="w-40 shrink-0 overflow-auto sm:w-56">
          <div className="mb-3 px-2 text-[11px] uppercase tracking-[0.18em] text-zinc-500">How deltat works</div>
          <nav className="space-y-0.5">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTopic(item.id)}
                className={cn(
                  "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                  topic === item.id
                    ? "bg-emerald-400/15 text-emerald-200 ring-1 ring-emerald-400/20"
                    : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                )}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1 overflow-auto pb-10">{content}</main>
      </div>
    </div>
  );
}
