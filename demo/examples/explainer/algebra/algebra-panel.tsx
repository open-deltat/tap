"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatTime } from "@/lib/time";
import { type Span } from "../algebra";

interface AlgebraPanelProps {
  bobOpen: Span[];
  bobBlocking: Span[];
  bobBookings: { start: number; end: number }[];
  bobNet: Span[];
  doraNet: Span[];
  combined: { start: number; end: number }[];
}

const fmtSpans = (spans: { start: number; end: number }[]): string =>
  spans.length === 0 ? "∅" : spans.map((s) => `[${formatTime(s.start)}, ${formatTime(s.end)})`).join(" ∪ ");

export function AlgebraPanel({
  bobOpen,
  bobBlocking,
  bobBookings,
  bobNet,
  doraNet,
  combined,
}: AlgebraPanelProps) {
  const [open, setOpen] = useState(false);

  const lines: [string, string, string][] = [
    ["Bob.open", fmtSpans(bobOpen), "non-blocking rule"],
    ["− Bob.blocking", fmtSpans(bobBlocking), "blocking rules"],
    ["− Bob.bookings", fmtSpans(bobBookings), "allocations, +buffer"],
    ["= Bob.net", fmtSpans(bobNet), "dt.availability.get(bob)"],
    ["Jane.net", fmtSpans(doraNet), "dt.availability.get(dora)"],
    ["Bob ∩ Jane", fmtSpans(combined), "getCombined(…, min_available = 2)"],
  ];

  return (
    <div className="mt-4 rounded-lg border border-white/10 bg-black/20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 hover:text-zinc-200"
      >
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        Detailed algebra
      </button>
      {open && (
        <div className="space-y-0.5 overflow-x-auto px-3 pb-3 font-mono text-[11px]">
          {lines.map(([lhs, rhs, note], i) => (
            <div key={i} className="flex items-baseline gap-2 whitespace-nowrap">
              <span className="w-28 shrink-0 text-zinc-400">{lhs}</span>
              <span className="text-emerald-300">= {rhs}</span>
              <span className="text-zinc-600">// {note}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
