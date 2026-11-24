import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { ScheduleSnippet, ButtonSnippet } from "@/components/tools/widget-snippet";
import { pageMetadata, webApplicationLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/availability-widget");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const EMBED_HEIGHT = 820;
const EMBED_ROUTE_SOURCE = "https://github.com/open-deltat/tap/tree/main/demo/app/embed";

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const PROSE = "mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2";

export default function AvailabilityWidgetPage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[webApplicationLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href, category: "BusinessApplication" })]}
      lead={
        <p>
          Two ways to put Δt on your own website. A live schedule that updates as places are taken, and a Book a time button that opens your
          booking link. Copy the snippet, paste it, done.
        </p>
      }
    >
      <ToolSection title="A live schedule">
        <p className={PROSE}>
          This is the real widget, loaded in an iframe, with a class schedule for a demo studio. It is read-only: it shows what is free and
          what is full, and it changes while you watch when someone books.
        </p>
        <div className="mt-5 overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
          <iframe src="/embed/gym" width="100%" height={EMBED_HEIGHT} style={{ border: 0 }} loading="lazy" title="Class schedule" className="block" />
        </div>
        <div className="mt-5">
          <ScheduleSnippet />
        </div>
        <p className={PROSE}>
          The live embed works for the demo schedule today. To show your own calendar, use the button below, or self-host: the embed route is
          open source and lives in the{" "}
          <a href={EMBED_ROUTE_SOURCE} target="_blank" rel="noreferrer" className={LINK}>
            repository
          </a>
          .
        </p>
      </ToolSection>

      <ToolSection title="A Book a time button for your calendar">
        <p className={PROSE}>
          Your own calendar is shared through its booking link. Paste the link here and get a button that opens it. Don&rsquo;t have a link yet?{" "}
          <Link href="/tools/book-me-link" className={LINK}>
            Your AI assistant can make one in a minute.
          </Link>
        </p>
        <ButtonSnippet />
      </ToolSection>
    </ToolShell>
  );
}
