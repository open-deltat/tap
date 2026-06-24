import { CollisionToy } from "@/components/collision-toy";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "What is Δt? A database for time",
  description:
    "Δt makes time itself the data: a booking is a stretch on one line, a conflict is an overlap, and availability is the gaps, computed in an instant on every read.",
  path: "/docs",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function WhatIsDeltatPage() {
  const [before, after] = docContent("what-is-deltat").split("<!--COLLISION-->");
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Δt · the database" title="What is Δt" />
      <Markdown>{before}</Markdown>
      <div className="my-2">
        <CollisionToy />
      </div>
      <Markdown>{after}</Markdown>
    </article>
  );
}
