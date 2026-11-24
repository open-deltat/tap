import Link from "next/link";
import { ToolShell, ToolSection } from "@/components/tools/tool-shell";
import { HowItWorks } from "@/components/tools/how-it-works";
import { AgentRun } from "@/components/tools/agent-run";
import { pageMetadata, webApplicationLd } from "@/lib/seo";
import { toolByHref } from "@/lib/tools/registry";

const TOOL = toolByHref("/tools/ai-agent-booking");

export const metadata = pageMetadata({ title: TOOL.title, description: TOOL.description, path: TOOL.href });

const LINK = "text-dt-accent-ink underline decoration-dt-accent/40 underline-offset-4";

export default function AiAgentBookingPage() {
  return (
    <ToolShell
      tool={TOOL}
      ld={[webApplicationLd({ title: TOOL.title, description: TOOL.description, path: TOOL.href, category: "DeveloperApplication" })]}
      lead={
        <p>
          Someone asks an agent for an appointment. Watch it find a time, hold it, and book it with the Δt MCP tools, and see what happens when
          another agent takes the time first. The tool calls and replies are real and run when you press the button. The agent&apos;s words are a
          script, so no language model is involved here.
        </p>
      }
    >
      <AgentRun />

      <HowItWorks
        title="What the agent is doing"
        steps={[
          {
            title: "find_slots: read, promise nothing",
            body: "The agent asks what is free in a window. A free slot it has only read can be gone a moment later, so it does not say any time out loud yet.",
          },
          {
            title: "hold_slot: hold before it speaks",
            body: "The agent holds the time it is about to offer. The hold lasts five minutes and lets go on its own, so an agent that loses the conversation leaves nothing behind.",
          },
          {
            title: "A lost race costs one call",
            body: "When another agent got there first, the refusal says CONFLICT and lists times that still work, marked as not reserved. The agent holds one of those straight away, with no second search.",
          },
          {
            title: "commit_hold: only now is it booked",
            body: "The person agrees and the agent commits the hold. That turns it into a booking in one step, and only then does the agent say it is booked.",
          },
        ]}
      />

      <ToolSection title="Run it with your own agent">
        <p className="mt-3 max-w-[68ch] text-[15.5px] leading-relaxed text-dt-ink-2">
          This page talks to the open-source MCP server, <code className="rounded-md bg-dt-sunken px-1.5 py-0.5 font-mono text-[0.86em]">@open-deltat/mcp</code>,
          the same one <code className="rounded-md bg-dt-sunken px-1.5 py-0.5 font-mono text-[0.86em]">npx @open-deltat/mcp</code> starts on your machine. To
          give Claude or any other agent a calendar of its own, follow{" "}
          <Link href="/tools/mcp-calendar" data-umami-event="tool-agent-booking-app" data-umami-event-from="mcp-calendar" className={`font-medium ${LINK}`}>
            MCP calendar: connect Claude in two minutes
          </Link>
          . The pattern behind these calls is in{" "}
          <Link href="/docs/guides/ai-agent-scheduling" className={LINK}>
            scheduling for AI agents
          </Link>
          , and the same thing on a live phone call is in{" "}
          <Link href="/docs/guides/voice-agent-booking" className={LINK}>
            voice agents that book
          </Link>
          .
        </p>
      </ToolSection>
    </ToolShell>
  );
}
