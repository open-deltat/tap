import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Buffer time between bookings",
  description:
    "Cleaning, reset, and travel time modeled where it belongs: bufferAfter stretches every allocation's tail on the timeline, so no code path can book the turnaround.",
  path: "/docs/guides/buffer-time",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function BufferTimePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Buffer time", path: "/docs/guides/buffer-time" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Buffer time" />
      <Markdown>{docContent("guides/buffer-time")}</Markdown>
    </article>
  );
}
