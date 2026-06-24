import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Under the hood · Δt docs" };

export default function UnderTheHoodPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="Under the hood" />
      <Markdown>{docContent("protocol-and-engine")}</Markdown>
    </article>
  );
}
