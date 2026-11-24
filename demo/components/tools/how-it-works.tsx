import type { ReactNode } from "react";
import { ToolSection } from "@/components/tools/tool-shell";

export interface Step {
  readonly title: string;
  readonly body: ReactNode;
}

// What happened underneath, as numbered steps in one card: the reader just used the tool, and this
// is the part that makes it believable.
export function HowItWorks({ title = "How it works", steps }: { title?: string; steps: readonly Step[] }) {
  return (
    <ToolSection title={title}>
      <ol className="mt-4 overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
        {steps.map((s, i) => (
          <li key={s.title} id={`step-${i + 1}`} className="flex gap-4 border-t border-dt-line p-5 first:border-t-0 sm:p-6">
            <span className="mt-0.5 font-mono text-[12.5px] text-dt-ink-3">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0">
              <h3 className="text-[15.5px] font-semibold tracking-tight text-dt-ink">{s.title}</h3>
              <div className="mt-1 max-w-[68ch] text-pretty text-[15px] leading-relaxed text-dt-ink-2">{s.body}</div>
            </div>
          </li>
        ))}
      </ol>
    </ToolSection>
  );
}
