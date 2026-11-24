import type { ReactNode } from "react";
import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { CodeBlock } from "@/components/tools/code-block";
import { pageMetadata, howToLd, SITE } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/mcp-calendar");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const MCP_URL = `${SITE.url}/mcp`;
const CONNECT_COMMAND = `claude mcp add --transport http deltat ${MCP_URL}`;

const PROMPTS = [
  "Make a calendar called Consultations, Berlin time, 30-minute slots, weekdays 9 to 5, and give me its booking link.",
  "What times are free on Consultations this week?",
  "Make a booking pass for Consultations so one person's agent can book directly next week.",
] as const;

const HOSTED_TOOLS = [
  ["create_calendar", "Make a calendar in your account: name, time zone, slot length, weekly hours, places at the same time, time between bookings."],
  ["list_my_calendars", "See your calendars, with their ids and booking links."],
  ["how_to_model_calendars", "Learn how to set up a business as calendars before creating them."],
  ["find_meeting_times, request_meeting", "Ask for a meeting on someone's calendar. Nothing is booked until its owner approves."],
  ["list_meeting_requests, approve_meeting_request", "Answer the requests on your own calendars."],
  ["create_booking_pass", "Let one person's agent book directly on your calendar, once, within a window."],
  ["find_times_with_pass, hold_with_pass, book_with_pass", "Book with a pass someone gave you."],
] as const;

const SELF_HOST_CLAUDE_CODE = `claude mcp add deltat \\
  --env DELTAT_HOST=localhost \\
  --env DELTAT_PASSWORD=<pick-a-password> \\
  -- npx -y @open-deltat/mcp`;

const SELF_HOST_DESKTOP = `{
  "mcpServers": {
    "deltat": {
      "command": "npx",
      "args": ["-y", "@open-deltat/mcp"],
      "env": {
        "DELTAT_HOST": "localhost",
        "DELTAT_PASSWORD": "<pick-a-password>"
      }
    }
  }
}`;

// Each step is written once and rendered twice: as the numbered list the reader sees and as the
// HowTo structured data (`text` plus whatever `shown` repeats in code), so the two cannot drift.
const STEPS = [
  {
    title: "Add Δt to Claude Code",
    text: "Run this once in a terminal.",
    shown: CONNECT_COMMAND,
    extra: <CodeBlock className="mt-3" code={CONNECT_COMMAND} label="Claude Code" event="tool-mcp-calendar-use" from="connect" />,
  },
  {
    title: "Or add it to Claude Desktop or claude.ai",
    text: `Open the connectors settings and add ${MCP_URL} as a connector. Any other MCP client that takes a URL works the same way.`,
  },
  {
    title: "Sign in",
    text: "The first time Claude uses Δt, it asks you to sign in. Every calendar it makes belongs to your account and shows on your dashboard at delt.at.",
  },
  {
    title: "Ask for a calendar",
    text: "Tell Claude what you need, in your own words. Three things to try:",
    shown: PROMPTS.join(" "),
    extra: (
      <div className="mt-3 grid gap-3">
        {PROMPTS.map((p, n) => (
          <CodeBlock key={p} code={p} label={`Prompt ${n + 1}`} />
        ))}
      </div>
    ),
  },
] satisfies readonly { title: string; text: string; shown?: string; extra?: ReactNode }[];

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";
const PROSE = "mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2";

export default function McpCalendarPage() {
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
      ld={[howToLd({ title: TOOL.h1, description: TOOL.description, path: TOOL.href, totalTime: "PT2M", steps: ldSteps })]}
      lead={
        <p>
          Give Claude a calendar it can book on. Add one URL, sign in once, and ask. The calendars are real, they belong to your account, and
          each one gets a public booking link.
        </p>
      }
    >
      <HowItWorks title="Connect it" steps={steps} />

      <ToolSection title="What Claude gets on the hosted server">
        <p className={PROSE}>
          These are the tools the hosted Δt gives your agent. To book, it asks for a meeting and the owner approves, or it uses a booking pass
          you handed out. Either way it holds the time before it promises it.
        </p>
        <dl className="mt-4 overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
          {HOSTED_TOOLS.map(([name, does]) => (
            <div key={name} className="grid gap-1 border-t border-dt-line px-5 py-3.5 first:border-t-0 sm:grid-cols-[17rem_1fr] sm:gap-4 sm:px-6">
              <dt className="break-words font-mono text-[13px] text-dt-ink">{name}</dt>
              <dd className="text-[14.5px] leading-relaxed text-dt-ink-2">{does}</dd>
            </div>
          ))}
        </dl>
        <p className={PROSE}>
          To watch an agent book a slot and lose a race to another one, open{" "}
          <Link href="/tools/ai-agent-booking" className={LINK}>
            AI agent booking, live
          </Link>
          . The full tool list and the exact replies are in the{" "}
          <Link href="/docs/quickstart" className={LINK}>
            quickstart
          </Link>
          .
        </p>
      </ToolSection>

      <ToolSection title="Run it on your own Δt">
        <p className={PROSE}>
          Rather keep the data on your own machine? Run Δt yourself (one binary or Docker, see{" "}
          <Link href="/docs/sdk/self-host" className={LINK}>
            self-host
          </Link>
          ) and point the open-source MCP server <code className="font-mono text-[13.5px] text-dt-ink">@open-deltat/mcp</code> at it. It can do more:
          several calendars in one booking, cancelling, changing hours. Replace the placeholder with the password you gave Δt.
        </p>
        <div className="mt-4 grid gap-4">
          <CodeBlock code={SELF_HOST_CLAUDE_CODE} label="Claude Code" />
          <CodeBlock code={SELF_HOST_DESKTOP} label="Claude Desktop: claude_desktop_config.json" />
        </div>
      </ToolSection>
    </ToolShell>
  );
}
