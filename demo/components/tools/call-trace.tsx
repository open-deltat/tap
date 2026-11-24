import { cn } from "@/lib/utils";
import type { Call, CallKind } from "@/lib/tools/trace";

// The colour each call wears is the colour its result has in the examples (see landing/verbs):
// green finds, amber holds, ink books. A refusal is amber-outlined, never red: losing a slot is the
// normal case the product is built for, not an error.
const KIND: Record<CallKind, string> = {
  find: "bg-dt-accent-soft text-dt-accent-ink",
  hold: "bg-dt-held-soft text-dt-held-ink",
  commit: "bg-dt-ink text-dt-on-ink",
  release: "border border-dt-line bg-dt-surface text-dt-ink-2",
  read: "border border-dt-line bg-dt-surface text-dt-ink-2",
};

/** MCP tools reply with JSON inside a text block; show it as JSON when it is, as text when not. */
function pretty(value: unknown): string {
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  return JSON.stringify(value, null, 2) ?? "undefined";
}

/** `stacked` keeps sent and reply one above the other, for a trace that sits in a half-width column. */
export function CallTrace({ calls, className, stacked = false }: { calls: readonly Call[]; className?: string; stacked?: boolean }) {
  return (
    <ol className={cn("space-y-3", className)}>
      {calls.map((c, i) => (
        <li key={i} className="dt-rise overflow-hidden rounded-2xl border border-dt-line bg-dt-surface">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-dt-line px-4 py-2.5">
            <span className="text-[12.5px] font-medium text-dt-ink-2">{c.who}</span>
            <code className={cn("inline-flex h-7 items-center rounded-md px-2 font-mono text-[12.5px]", KIND[c.kind])}>{c.name}</code>
            <span className="ml-auto flex items-center gap-2 text-[12px] tabular-nums text-dt-ink-3">
              {c.ms} ms
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-[11px] font-medium",
                  c.outcome.ok ? "bg-dt-accent-soft text-dt-accent-ink" : "bg-dt-held-soft text-dt-held-ink"
                )}
              >
                {c.outcome.ok ? "ok" : c.outcome.code}
              </span>
            </span>
          </div>
          <div className={cn("grid min-w-0 gap-px bg-dt-line", !stacked && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
            <Pane title="Sent" body={pretty(c.args)} />
            <Pane title="Reply" body={pretty(c.outcome.reply)} />
          </div>
        </li>
      ))}
    </ol>
  );
}

function Pane({ title, body }: { title: string; body: string }) {
  return (
    <div className="min-w-0 bg-dt-surface px-4 py-3">
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-dt-ink-3">{title}</div>
      <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed text-dt-ink">{body}</pre>
    </div>
  );
}
