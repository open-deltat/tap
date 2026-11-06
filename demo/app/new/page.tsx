import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { ConnectAgent } from "@/components/connect-agent";
import { pageMetadata, webPageLd } from "@/lib/seo";

// Kept at /new because search engines know it. Calendars are no longer made on the website: this page
// says how to have your agent make one, through the hosted MCP at delt.at/mcp.
const SEO = {
  title: "Create a calendar with your agent",
  description:
    "Ask your AI agent for the calendar you need. Connect it to delt.at/mcp once, sign in, describe the calendar, and it is created in your account.",
  path: "/new",
};

export const metadata: Metadata = pageMetadata(SEO);

export default function NewCalendarPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <JsonLd graph={[webPageLd(SEO)]} />
      <ConnectAgent as="h1" />
    </main>
  );
}
