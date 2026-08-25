import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "What is a booking hold?",
  description:
    "A hold is a tentative claim on a slot with a self-destruct timer: it blocks instantly and frees itself if nobody confirms. How hold-to-book checkout flows work.",
  path: "/docs/guides/booking-holds",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function BookingHoldsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Booking holds", path: "/docs/guides/booking-holds" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Booking holds" />
      <Markdown>{docContent("guides/booking-holds")}</Markdown>
    </article>
  );
}
