import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Voice agents that book appointments",
  description:
    "A voice agent has to say a slot out loud before it can take it, and that sentence is the race. Hold each option before offering it, then commit the one they pick.",
  path: "/docs/guides/voice-agent-booking",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function VoiceAgentBookingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Voice agents that book", path: "/docs/guides/voice-agent-booking" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Agents · in real time" title="Voice agents that book" />
      <Markdown>{docContent("guides/voice-agent-booking")}</Markdown>
    </article>
  );
}
