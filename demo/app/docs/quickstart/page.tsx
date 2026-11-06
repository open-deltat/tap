import { ArrowRight } from "lucide-react";
import { DocHeader } from "@/components/doc-header";
import { DocBody } from "@/components/doc-body";
import { JsonLd } from "@/components/json-ld";
import { VERBS, VerbChip } from "@/components/landing/verbs";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Agent quickstart: give your agent a calendar",
  description:
    "Run Δt, add the MCP server to Claude or any MCP client, and your agent can find, hold and book times on a real calendar without double bookings.",
  path: "/docs/quickstart",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

// The three tools an agent calls for every booking, in order, in the colours of their results.
function AgentTools() {
  const steps = VERBS.slice(0, 3);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
      {steps.map((v, i) => (
        <div key={v.tool} className="flex items-center gap-3">
          <VerbChip verb={v} />
          {i < steps.length - 1 && <ArrowRight aria-hidden className="h-4 w-4 text-dt-ink-3" />}
        </div>
      ))}
    </div>
  );
}

export default function AgentQuickstartPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Agent quickstart", path: "/docs/quickstart" },
          ]),
        ]}
      />
      <DocHeader title="Agent quickstart" />
      <DocBody source={docContent("quickstart")} slots={{ AGENT_TOOLS: <AgentTools /> }} />
    </article>
  );
}
