"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@open-deltat/examples/components/ui/button";

// The public URL, visible and one click from copied. Deliberately NOT a dialog: hiding a link
// behind a modal adds a click and hides the thing people came for. The URL is short enough to show.
export function ShareLinks({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const url = typeof window === "undefined" ? path : `${window.location.origin}${path}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked; the URL is visible next to the button */
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="bg-muted text-muted-foreground min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-xs">
        {path}
      </code>
      <Button type="button" size="sm" variant="outline" onClick={copy}>
        {copied ? <Check className="text-emerald-500" /> : <Copy />}
        {copied ? "Copied" : "Copy public URL"}
      </Button>
      <Button asChild size="sm" variant="ghost">
        <a href={path} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open
        </a>
      </Button>
    </div>
  );
}
