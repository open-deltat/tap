import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Capacity, pools, and shared resources",
  description:
    "How capacity lets bookings stack on one resource until it is full, when to model seats as child resources instead, and how pool queries answer if anything is free.",
  path: "/docs/guides/capacity",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function CapacityPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Capacity and pools", path: "/docs/guides/capacity" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Capacity and pools" />
      <Markdown>{docContent("guides/capacity")}</Markdown>
    </article>
  );
}
