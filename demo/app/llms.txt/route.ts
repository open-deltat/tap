import { enabledExamples } from "@open-deltat/examples/manifest";
import { DOCS_SECTIONS } from "@/lib/docs-nav";
import { SITE } from "@/lib/seo";

// llms.txt (https://llmstxt.org): one plain-markdown index of the site for models that fetch a page
// instead of crawling it. Derived from the same docs tree the sidebar and sitemap use, so a new
// guide appears here by adding it to DOCS_SECTIONS and nowhere else.
export const dynamic = "force-static";

function section(
  title: string,
  links: { href: string; label: string; note?: string }[]
): string {
  const lines = links.map(
    ({ href, label, note }) => `- [${label}](${SITE.url}${href})${note ? `: ${note}` : ""}`
  );
  return `## ${title}\n\n${lines.join("\n")}`;
}

function body(): string {
  const demos = enabledExamples().map(({ href, label, tagline }) => ({
    href,
    label,
    note: tagline.toLowerCase(),
  }));

  return [
    `# ${SITE.name} (deltat)`,
    "",
    `> ${SITE.description}`,
    "",
    "Δt stores a booking as a half-open span on one timeline per resource. A conflict is an overlap,",
    "and availability is the gaps, computed by a sweep on every read rather than cached. The conflict",
    "check runs inside the write, so a stale read cannot become a double booking. Holds are tentative",
    "claims with a server-enforced TTL that convert to bookings in one atomic statement, which is the",
    "primitive an AI agent needs when its decision takes seconds. Δt speaks the PostgreSQL wire",
    "protocol, so any Postgres client can talk to it. TAP, the Time Allocation Protocol, is the model",
    "every surface shares; @open-deltat/client is its typed TypeScript SDK.",
    `Agents connect to the hosted Δt at ${SITE.url}/mcp (the person signs in once). There an agent creates`,
    "calendars in that person's account (create_calendar, list_my_calendars; how_to_model_calendars explains",
    "how to set up a business from the examples below), asks for meetings and books with booking passes.",
    "Calendars are created only through the MCP; the website shows them. To run your own Δt, agents use",
    "the open-source MCP server (npx @open-deltat/mcp): find_slots, hold_slot, commit_hold.",
    "",
    ...DOCS_SECTIONS.map((s) => `${section(s.title, s.links)}\n`),
    section("Try it", [
      {
        href: "/new",
        label: "Create a calendar with your agent",
        note: `connect your agent to ${SITE.url}/mcp and ask it for the calendar you need`,
      },
      ...demos,
    ]),
    "",
    "## Source",
    "",
    `- [deltat, the database (Rust, AGPL-3.0-or-later)](${SITE.deltatRepo})`,
    `- [tap, the protocol and TypeScript SDK (MIT)](${SITE.github}/tap)`,
    `- [open-deltat on GitHub](${SITE.github})`,
    "",
  ].join("\n");
}

export function GET(): Response {
  return new Response(body(), {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
