"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { Button } from "@open-deltat/examples/components/ui/button";

// The share affordance: shows the public booking URL, copies it, and links out to it. This is the
// link a human opens, or an AI agent is pointed at.
export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  const href = path;

  const copy = async () => {
    const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the link is still visible */
    }
  };

  return (
    <div className="flex items-center gap-2">
      <code className="bg-muted text-muted-foreground min-w-0 flex-1 truncate rounded-md px-2.5 py-1.5 text-xs">
        {path}
      </code>
      <Button type="button" size="sm" variant="outline" onClick={copy} className="shrink-0">
        {copied ? <Check className="text-emerald-500" /> : <Copy />}
        {copied ? "Copied" : "Copy"}
      </Button>
      <Button asChild size="sm" variant="ghost" className="shrink-0">
        <a href={href} target="_blank" rel="noreferrer">
          <ExternalLink />
          Open
        </a>
      </Button>
    </div>
  );
}
