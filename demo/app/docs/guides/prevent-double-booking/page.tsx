import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "How to prevent double bookings",
  description:
    "A double booking is a race: two requests both told a slot was free. What constraints and locks cover, and how a write that is its own conflict check closes the gap.",
  path: "/docs/guides/prevent-double-booking",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function PreventDoubleBookingPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Preventing double bookings", path: "/docs/guides/prevent-double-booking" },
          ]),
        ]}
      />
      <DocHeader eyebrow="Guides · in practice" title="Preventing double bookings" />
      <Markdown>{docContent("guides/prevent-double-booking")}</Markdown>
    </article>
  );
}
