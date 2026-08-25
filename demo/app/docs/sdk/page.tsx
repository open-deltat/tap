import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "What is TAP? The Time Allocation Protocol",
  description:
    "TAP is the Time Allocation Protocol: one shared way to describe and access time, scheduling, booking, and availability, with a typed TypeScript SDK to speak it.",
  path: "/docs/sdk",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article", absoluteTitle: true });

export default function WhatIsTapPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is TAP", path: "/docs/sdk" },
          ]),
        ]}
      />
      <DocHeader eyebrow="TAP · the protocol" title="What is TAP" />
      <Markdown>{docContent("what-is-tap")}</Markdown>
    </article>
  );
}
