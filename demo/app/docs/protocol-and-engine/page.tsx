import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Protocol and engine · Δt docs" };

export default function ProtocolAndEnginePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="Protocol and engine" />
      <Markdown>{docContent("protocol-and-engine")}</Markdown>
    </article>
  );
}
