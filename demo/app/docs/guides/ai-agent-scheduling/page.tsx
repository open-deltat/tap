import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Scheduling for AI agents",
  description:
    "An AI agent's think step is seconds long, so check-then-book races on every request. The propose-then-confirm pattern: hold the slot, then commit it atomically.",
  path: "/docs/guides/ai-agent-scheduling",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function AiAgentSchedulingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Scheduling for AI agents", path: "/docs/guides/ai-agent-scheduling" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Agents · in real time" title="Scheduling for AI agents" />
      <Markdown>{docContent("guides/ai-agent-scheduling")}</Markdown>
    </article>
  );
}
