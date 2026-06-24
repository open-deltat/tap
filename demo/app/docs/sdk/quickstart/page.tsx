import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Quickstart · tap docs" };

export default function QuickstartPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="tap · the protocol" title="Quickstart" />
      <Markdown>{docContent("sdk-quickstart")}</Markdown>
    </article>
  );
}
