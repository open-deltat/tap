import { HoldsStatic } from "@/examples/explainer/holds/holds-static";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Holds and availability",
  description:
    "Holds settle races with a self-expiring timer, and availability is the gaps recomputed on every read, with atomic batch bookings and live updates.",
  path: "/docs/holds-and-availability",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function HoldsAndAvailabilityPage() {
  const [intro, detail] = docContent("holds-and-availability").split("<!--HOLDS_WIDGET-->");
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Holds and availability", path: "/docs/holds-and-availability" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Δt · the database" title="Holds and availability" />
      <Markdown>{intro}</Markdown>
      <div className="mt-6">
        <HoldsStatic />
      </div>
      <Markdown>{detail}</Markdown>
    </article>
  );
}
