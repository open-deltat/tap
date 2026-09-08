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
    "protocol, so any Postgres client can talk to it; TAP is the typed TypeScript SDK on top.",
    "",
    ...DOCS_SECTIONS.map((s) => `${section(s.title, s.links)}\n`),
    section("Try it", [
      {
        href: "/new",
        label: "Make something bookable",
        note: "publish a real bookable timeline, no account needed",
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
