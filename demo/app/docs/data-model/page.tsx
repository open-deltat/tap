import { HierarchyViz, StorageDiagram } from "@/examples/explainer/concepts";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Data model · Δt docs" };

export default function DataModelPage() {
  const [intro, rest] = docContent("data-model").split("<!--HIERARCHY-->");
  const [middle, tail] = rest.split("<!--STORAGE-->");
  return (
    <article className="mx-auto max-w-3xl">
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
