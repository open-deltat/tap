"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ACCENT_GHOST } from "@open-deltat/examples/lib/accent";

// Shows the copy-paste <iframe> for an example's chrome-free /embed/<id> route. The origin is read
// at runtime so the snippet is correct wherever the demo is deployed; before hydration it falls back
// to a readable placeholder.
export function EmbedSnippet({
  example,
  className,
  height = 820,
}: {
  example: string;
  className?: string;
  height?: number;
}) {
  const [origin, setOrigin] = useState("https://your-deltat-demo");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const snippet = `<iframe src="${origin}/embed/${example}" width="100%" height="${height}" style="border:0;border-radius:12px" loading="lazy" title="Class schedule"></iframe>`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success("Embed code copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Copy failed. Select and copy manually.");
    }
  }

  return (
    <div className={cn("rounded-xl border border-white/[0.06] bg-white/[0.02] p-4", className)}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-zinc-200">Embed this schedule</div>
          <div className="text-[11px] text-zinc-500">
            Paste it on any site. It loads the read-only public schedule, no internal data.
          </div>
        </div>
        <button
          onClick={copy}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
            ACCENT_GHOST
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg border border-white/[0.06] bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-400">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
