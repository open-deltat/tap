import { HoldsStatic } from "@/examples/explainer/holds/holds-static";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "Holds and availability · Δt docs" };

export default function HoldsAndAvailabilityPage() {
  const [intro, detail] = docContent("holds-and-availability").split("<!--HOLDS_WIDGET-->");
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="Holds and availability" />
      <Markdown>{intro}</Markdown>
      <div className="mt-6">
        <HoldsStatic />
      </div>
      <Markdown>{detail}</Markdown>
    </article>
  );
}
