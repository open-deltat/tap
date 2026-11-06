import { SITE } from "@/lib/seo";

// How a calendar gets made: by the person's own agent, through the hosted MCP. The website never
// creates calendars, so this block is what stands where a create form would: on the dashboard, on
// /new, and in the agent quickstart. One component, so the connect lines are written once.

const MCP_URL = `${SITE.url}/mcp`;

export const EXAMPLE_ASK = "Create a calendar called Consultations, Berlin time, 30-minute slots, weekdays 9 to 5.";

const CLIENTS = [
  { name: "Claude Code", how: "Run once in a terminal", code: `claude mcp add --transport http deltat ${MCP_URL}` },
  // One row for every client that takes a URL: two rows showing the same URL read as two steps.
  { name: "Claude Desktop, claude.ai or any MCP client", how: "Add this URL as a connector", code: MCP_URL },
] as const;

export function ConnectAgent({ as: Heading = "h2" }: { as?: "h1" | "h2" }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      <div className="px-5 pt-6 pb-5 sm:px-6">
        <Heading className="text-balance text-[1.25rem] font-semibold tracking-[-0.01em] text-dt-ink">
          Create a calendar with your agent
        </Heading>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-dt-ink-2">
          Connect your AI agent to Δt once, sign in when it asks, then tell it the calendar you need.
        </p>
      </div>
      <dl>
        {CLIENTS.map((c) => (
          <div key={c.name} className="grid gap-2 border-t border-dt-line px-5 py-4 sm:grid-cols-[13rem_1fr] sm:gap-4 sm:px-6">
            <dt className="text-[14px] font-medium text-dt-ink sm:pt-1">{c.name}</dt>
            <dd className="flex min-w-0 flex-col gap-1.5">
              <span className="text-[12.5px] text-dt-ink-3">{c.how}</span>
              <code className="block rounded-lg bg-dt-sunken px-3 py-2 font-mono text-[13px] leading-relaxed break-words text-dt-ink">
                {c.code}
              </code>
            </dd>
          </div>
        ))}
      </dl>
      <div className="border-t border-dt-line px-5 py-5 sm:px-6">
        <div className="text-[12.5px] text-dt-ink-3">Then ask it</div>
        <p className="mt-1.5 text-[15px] leading-relaxed text-dt-ink">&ldquo;{EXAMPLE_ASK}&rdquo;</p>
      </div>
    </section>
  );
}
