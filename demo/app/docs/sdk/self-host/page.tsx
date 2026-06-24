import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Self-host · tap docs" };

export default function SelfHostPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="tap · the protocol" title="Self-host" />
      <Markdown>{docContent("sdk-self-host")}</Markdown>
    </article>
  );
}
