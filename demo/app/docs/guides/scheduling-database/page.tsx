import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Do you need a scheduling database?",
  description:
    "You can build bookings on Postgres, and sometimes you should. What exclusion constraints solve, where holds, capacity, and availability get steep, and what changes.",
  path: "/docs/guides/scheduling-database",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function SchedulingDatabasePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Do you need a scheduling database?", path: "/docs/guides/scheduling-database" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Do you need a scheduling database?" />
      <Markdown>{docContent("guides/scheduling-database")}</Markdown>
    </article>
  );
}
