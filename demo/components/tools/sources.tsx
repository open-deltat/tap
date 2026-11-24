import { ToolSection } from "@/components/tools/tool-shell";

export interface Source {
  readonly label: string;
  readonly href: string;
}

// Where every outside fact on the page was read, and when. A comparison is only as good as the date
// on it, so the date is part of the component rather than something a page can forget.
export function Sources({ read, items, note }: { read: string; items: readonly Source[]; note?: string }) {
  return (
    <ToolSection id="sources" title="Sources">
      <p className="mt-2 max-w-[68ch] text-[14.5px] leading-relaxed text-dt-ink-3">
        Read on {read}.{note ? ` ${note}` : ""}
      </p>
      <ul className="mt-4 grid gap-x-8 gap-y-2 text-[14px] sm:grid-cols-2">
        {items.map((s) => (
          <li key={s.href} className="min-w-0">
            <a href={s.href} target="_blank" rel="noreferrer" className="break-words text-dt-ink-2 underline decoration-dt-line-strong underline-offset-4 hover:text-dt-ink hover:decoration-dt-ink">
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </ToolSection>
  );
}
