import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Real-time scheduling",
  description:
    "Polling makes a schedule either stale or expensive. Subscribe to the resource, treat the event as a tick, and re-read availability that is computed rather than cached.",
  path: "/docs/guides/real-time-scheduling",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function RealTimeSchedulingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Real-time scheduling", path: "/docs/guides/real-time-scheduling" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Agents · in real time" title="Real-time scheduling" />
      <Markdown>{docContent("guides/real-time-scheduling")}</Markdown>
    </article>
  );
}
