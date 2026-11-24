import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { CodeBlock } from "@/components/tools/code-block";
import { pageMetadata, howToLd, SITE } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/book-me-link");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const MCP_URL = `${SITE.url}/mcp`;
const ASK = "Make me a booking link for 30-minute calls, weekdays 9 to 5, Berlin time.";
const ASK_FIRST = "Change my calendar so people ask for a time and I approve each one.";
const STANDALONE_APP = "https://github.com/open-deltat/tap/tree/main/calendar";

// Each step is written once and rendered twice: in the list the reader sees and in the HowTo
// structured data, so the two cannot drift apart.
const STEPS = [
  {
    title: "Add the connector",
    text: `In claude.ai or Claude Desktop, open the connectors settings and add ${MCP_URL} as a connector.`,
  },
  {
    title: "Sign in",
    text: "The first time your assistant uses it, it asks you to sign in. The calendar it makes belongs to your account.",
  },
  {
    title: "Ask for your link",
    text: "Type this into the chat, with your own hours and time zone:",
    shown: ASK,
    extra: <CodeBlock className="mt-3" code={ASK} label="Prompt" event="tool-book-me-link-use" from="prompt" />,
  },
  {
    title: "Share the link",
    text: "Your assistant makes the calendar and answers with its link, which looks like delt.at/b/ followed by an id. Put it in your email signature, your profile or a message.",
  },
  {
    title: "See your bookings",
    text: "Every booking shows on your dashboard at delt.at/dashboard.",
  },
] satisfies readonly { title: string; text: string; shown?: string; extra?: ReactNode }[];

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const PROSE = "mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2";

export default function BookMeLinkPage() {
  const steps = STEPS.map((s) => ({
    title: s.title,
    body: (
      <>
        <p>{s.text}</p>
        {"extra" in s ? s.extra : null}
      </>
    ),
  }));
  const ldSteps = STEPS.map((s) => ({ name: s.title, text: "shown" in s ? `${s.text} ${s.shown}` : s.text }));

  return (
    <ToolShell
      tool={TOOL}
      ld={[howToLd({ title: TOOL.h1, description: TOOL.description, path: TOOL.href, totalTime: "PT3M", steps: ldSteps })]}
      lead={
        <p>
          You do not need to write code. Tell your AI assistant what hours you are free, and it makes you a link. Anyone with the link picks
          a free time and books it, and nobody can book the same time twice.
        </p>
      }
    >
      <HowItWorks title="Get your link" steps={steps} />

      <ToolSection title="What people see">
        <p className={PROSE}>
          This is a booking page, framed on this page. It is the demo calendar for an appointments business, not yours, so you can click
          around without booking anything real. Your own link opens a page like it, with your hours.
        </p>
        <div className="mt-5 overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
          <div className="border-b border-dt-line px-5 py-3 text-[13px] text-dt-ink-3">Demo calendar: Appointments</div>
          <iframe src="/embed/availability" width="100%" height={760} style={{ border: 0 }} loading="lazy" title="Demo booking page: Appointments" className="block" />
        </div>
        <p className={PROSE}>
          <Link
            href="/demos/availability"
            data-umami-event="tool-book-me-link-app"
            data-umami-event-from="demo"
            className={`${LINK} inline-flex items-center gap-1`}
          >
            Open the full demo
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </p>
      </ToolSection>

      <ToolSection title="Book directly, or ask first">
        <p className={PROSE}>
          By default anyone with your link can book a free time straight away (they sign in first, unless you turn that off on your dashboard). If you want to approve each meeting, your calendar can take
          requests instead: people ask, and nothing is booked until you say yes. Tell your assistant which you want, now or later:
        </p>
        <CodeBlock className="mt-4" code={ASK_FIRST} label="Prompt" />
        <p className={PROSE}>
          The setting is called <code className="font-mono text-[13.5px] text-dt-ink">takes_meeting_requests</code>. It is off by default.
        </p>
      </ToolSection>

      <ToolSection title="What to know first">
        <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-[15.5px] leading-relaxed text-dt-ink-2 marker:text-dt-ink-3">
          <li>You need an AI assistant that supports MCP connectors, such as Claude. Without one there is nothing to type the sentence into.</li>
          <li>
            Δt does not sync with Google Calendar or Outlook, on purpose. Your link shows free times inside the hours you gave it, and knows nothing
            about the rest of your diary. If you are busy elsewhere, change the hours.
          </li>
          <li>One account can have up to 20 calendars. Deleting one frees a place.</li>
        </ul>
      </ToolSection>

      <ToolSection title="Rather run it yourself?">
        <p className={PROSE}>
          Δt is open source, so you can keep everything on your own server. Start with{" "}
          <Link href="/docs/sdk/self-host" className={LINK}>
            self-host
          </Link>
          . The repository also has a standalone booking app, the{" "}
          <a href={STANDALONE_APP} target="_blank" rel="noreferrer" className={LINK}>
            calendar folder
          </a>
          , if you want a ready-made page rather than building one.
        </p>
      </ToolSection>
    </ToolShell>
  );
}
