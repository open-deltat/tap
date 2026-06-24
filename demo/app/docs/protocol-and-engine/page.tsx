import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Under the hood: the Δt engine",
  description:
    "Under the hood: Δt is one Rust binary, kept durable by an append-only log, speaking the Postgres wire today, with every tenant isolated by its database name.",
  path: "/docs/protocol-and-engine",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function UnderTheHoodPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Under the hood", path: "/docs/protocol-and-engine" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Δt · the database" title="Under the hood" />
      <Markdown>{docContent("protocol-and-engine")}</Markdown>
    </article>
  );
}
