import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "SDK reference · tap docs" };

export default function ReferencePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="tap · the protocol" title="SDK reference" />
      <Markdown>{docContent("sdk-reference")}</Markdown>
    </article>
  );
}
