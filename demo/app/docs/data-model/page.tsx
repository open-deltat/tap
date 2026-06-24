import { DataModelTopic } from "@/examples/explainer/concepts";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Data model · Δt docs" };

export default function DataModelPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="Data model" />
      <div className="mt-2">
        <DataModelTopic />
      </div>
      <Markdown>{docContent("data-model")}</Markdown>
    </article>
  );
}
