import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Recurring availability without RRULE",
  description:
    "Weekly hours are a pattern; a timeline is concrete. Why Δt stores no recurrence, and how expandRecurrence turns days-of-week patterns into plain open-hours rules.",
  path: "/docs/guides/recurring-availability",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function RecurringAvailabilityPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Recurring availability", path: "/docs/guides/recurring-availability" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Recurring availability" />
      <Markdown>{docContent("guides/recurring-availability")}</Markdown>
    </article>
  );
}
