import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Connect with any Postgres client",
  description:
    "Δt answers the PostgreSQL wire protocol with no Postgres underneath: psql and ordinary drivers just connect. The whole SQL surface, tenants, and the limits.",
  path: "/docs/guides/postgres-wire",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function PostgresWirePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Any Postgres client", path: "/docs/guides/postgres-wire" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Any Postgres client" />
      <Markdown>{docContent("guides/postgres-wire")}</Markdown>
    </article>
  );
}
