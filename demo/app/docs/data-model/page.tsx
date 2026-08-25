import { HierarchyViz, StorageDiagram } from "@/examples/explainer/concepts";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Data model: resources, rules, availability",
  description:
    "How Δt shapes data: a tenant, a tree of resources, open hours, blackouts, and bookings on one timeline, with free derived as open minus blocked minus booked.",
  path: "/docs/data-model",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function DataModelPage() {
  const [intro, rest] = docContent("data-model").split("<!--HIERARCHY-->");
  const [middle, tail] = rest.split("<!--STORAGE-->");
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Data model", path: "/docs/data-model" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Δt · the database" title="Data model" />
      <Markdown>{intro}</Markdown>
      <div className="my-4">
        <HierarchyViz />
      </div>
      <Markdown>{middle}</Markdown>
      <div className="my-4">
        <StorageDiagram />
      </div>
      <Markdown>{tail}</Markdown>
    </article>
  );
}
