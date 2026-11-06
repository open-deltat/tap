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
    <div className={cn("rounded-2xl border border-dt-line bg-dt-surface p-4 shadow-dt-surface", className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-medium text-dt-ink">Embed this schedule</div>
          <div className="text-[12.5px] text-dt-ink-3">
            Paste it on any site. It loads the read-only public schedule, no internal data.
          </div>
        </div>
        <button
          onClick={copy}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors",
            ACCENT_GHOST
          )}
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      {/* Code stays dark in both themes, matching the docs fences. */}
      <pre className="overflow-x-auto rounded-xl bg-[#0b0b0f] p-3.5 font-mono text-[12px] leading-relaxed text-[#c4c4cc]">
        <code>{snippet}</code>
      </pre>
    </div>
  );
}
