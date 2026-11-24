"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

// A dark code fence (the docs' look) with a copy button. The button carries the page's Umami event,
// because copying the snippet is the main action on the setup pages.
export function CodeBlock({
  code,
  label,
  event,
  from,
  className,
}: {
  code: string;
  label?: string;
  /** Umami event name for the copy button, e.g. tool-mcp-calendar-use. */
  event?: string;
  from?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setState("copied");
    } catch {
      setState("failed");
    }
    setTimeout(() => setState("idle"), 1600);
  }

  return (
    <div className={cn("overflow-hidden rounded-2xl border border-dt-line bg-[#0b0b0f]", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-white/10 py-1.5 pl-4 pr-1.5">
        <span className="truncate text-[12px] text-[#9a9aa5]">{label ?? "Copy"}</span>
        <button
          type="button"
          onClick={copy}
          data-umami-event={event}
          data-umami-event-from={from}
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-[#e4e4e7] transition-colors hover:bg-white/10"
        >
          {state === "copied" ? <Check className="h-3.5 w-3.5 text-[#34d399]" /> : <Copy className="h-3.5 w-3.5" />}
          {state === "copied" ? "Copied" : state === "failed" ? "Select and copy" : "Copy"}
        </button>
      </div>
      {/* Wrapped, not scrolled: a phone reader should not have to swipe sideways through a command. */}
      <pre className="whitespace-pre-wrap break-words p-4 font-mono text-[12.5px] leading-relaxed text-[#e4e4e7]">
        <code>{code}</code>
      </pre>
    </div>
  );
}
