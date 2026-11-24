import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { CodeBlock } from "@/components/tools/code-block";
import { calendarGuide, type ExampleGuide } from "@open-deltat/examples/lib/calendar-guide";
import type { ExampleId } from "@open-deltat/examples/config";
import { enabledExamples } from "@open-deltat/examples/manifest";
import { pageMetadata, collectionPageLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/templates");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

// The businesses people search for come first. `live` and `builder` are not businesses.
const ORDER = ["hotel", "theater", "restaurant", "gym", "availability", "cinema", "airline", "stadium", "parking", "meet"] as const satisfies readonly ExampleId[];

const TEAM_ID = "team";

const CAN_BUILD: Record<ExampleGuide["mcp_can_build"], string> = {
  yes: "Your agent can build this",
  partly: "Partly",
  no: "Not through the MCP yet",
};

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const CARD = "scroll-mt-20 rounded-3xl border border-dt-line bg-dt-surface p-5 shadow-dt-surface sm:p-7";
const LABEL = "mt-5 text-[12.5px] font-medium uppercase tracking-wide text-dt-ink-3";
const BODY = "mt-1.5 max-w-[68ch] text-[15px] leading-relaxed text-dt-ink-2";

function TemplateCard({ guide, hasDemo }: { guide: ExampleGuide; hasDemo: boolean }) {
  return (
    <article id={guide.example} className={CARD}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-[1.25rem] font-semibold tracking-[-0.01em] text-dt-ink">{guide.title}</h3>
        <span className="rounded-full border border-dt-line px-2.5 py-0.5 text-[12px] font-medium text-dt-ink-2">{CAN_BUILD[guide.mcp_can_build]}</span>
      </div>
      <p className={BODY}>{guide.what}</p>

      <h4 className={LABEL}>How it is organised</h4>
      <ul className="mt-1.5 max-w-[68ch] list-disc space-y-1.5 pl-5 text-[15px] leading-relaxed text-dt-ink-2 marker:text-dt-ink-3">
        {guide.organised.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      <h4 className={LABEL}>Settings</h4>
      <p className={BODY}>{guide.settings}</p>

      {guide.cannot_yet ? <p className="mt-4 max-w-[68ch] text-[14px] leading-relaxed text-dt-ink-3">{guide.cannot_yet}</p> : null}

      {guide.steps.length > 0 ? (
        // Folded and one call per line: the full weekly hours of ten calendars ran to pages of JSON.
        <details className="group mt-5">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-[14.5px] font-medium text-dt-ink-2 hover:text-dt-ink">
            <span className="transition-transform group-open:rotate-90">›</span>
            The {guide.steps.length === 1 ? "call" : `${guide.steps.length} calls`} an agent makes to build it
          </summary>
          <CodeBlock
            className="mt-2"
            code={guide.steps.map((s) => `${s.tool} ${JSON.stringify(s.arguments)}`).join("\n\n")}
            label={`create_calendar × ${guide.steps.length}`}
            event="tool-templates-use"
            from={guide.example}
          />
        </details>
      ) : null}

      {hasDemo ? (
        <Link
          href={`/demos/${guide.example}`}
          data-umami-event="tool-templates-app"
          data-umami-event-from={guide.example}
          className={`${LINK} mt-5 inline-flex items-center gap-1 text-[15px]`}
        >
          Open the live demo
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      ) : null}
    </article>
  );
}

export default function TemplatesPage() {
  const guide = calendarGuide();
  const enabled = new Set(enabledExamples().map((e) => e.id));
  const cards = ORDER.flatMap((id) => {
    const found = guide.examples.find((g) => g.example === id);
    return found ? [found] : [];
  });
  const jump = [...cards.map((c) => ({ id: c.example, name: c.title })), { id: TEAM_ID, name: "Team with meeting rooms" }];

  return (
    <ToolShell
      tool={TOOL}
      ld={[
        collectionPageLd({
          title: TOOL.title,
          description: TOOL.description,
          path: TOOL.href,
          items: jump.map((j) => ({ name: j.name, path: `${TOOL.href}#${j.id}` })),
        }),
      ]}
      lead={
        <p>
          Hotel rooms, theater seats, restaurant tables, classes, parking and meeting rooms, each as a set of calendars. This is the same guide
          the hosted MCP hands to your agent, so what you read here is what it builds.
        </p>
      }
    >
      <nav aria-label="Templates" className="flex flex-wrap gap-2">
        {jump.map((j) => (
          <a key={j.id} href={`#${j.id}`} className="rounded-full border border-dt-line px-3.5 py-1.5 text-[13.5px] text-dt-ink-2 transition-colors hover:border-dt-line-strong hover:text-dt-ink">
            {j.name}
          </a>
        ))}
      </nav>

      <ToolSection title="One calendar or several">
        <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-[15.5px] leading-relaxed text-dt-ink-2 marker:text-dt-ink-3">
          {guide.choosing.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </ToolSection>

      <div className="mt-10 grid gap-5 sm:mt-14">
        {cards.map((c) => (
          <TemplateCard key={c.example} guide={c} hasDemo={enabled.has(c.example)} />
        ))}

        <article id={TEAM_ID} className={CARD}>
          <h3 className="text-[1.25rem] font-semibold tracking-[-0.01em] text-dt-ink">Team with meeting rooms</h3>
          <p className={BODY}>{guide.company.pattern}</p>
          <h4 className={LABEL}>Reaching each one</h4>
          <p className={BODY}>{guide.company.reaching_each}</p>
          <h4 className={LABEL}>Requests or direct booking</h4>
          <p className={BODY}>{guide.company.requests_or_direct}</p>
        </article>
      </div>
    </ToolShell>
  );
}
