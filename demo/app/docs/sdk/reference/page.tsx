import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "TAP SDK reference (@open-tap/client)",
  description:
    "The complete @open-tap/client verb surface: resources, rules, bookings, holds, availability, and events, each with its TypeScript signature and a short example.",
  path: "/docs/sdk/reference",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function ReferencePage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is TAP", path: "/docs/sdk" },
            { name: "SDK reference", path: "/docs/sdk/reference" },
          ]),
        ]}
      />
      <DocHeader eyebrow="TAP · the protocol" title="SDK reference" />
      <Markdown>{docContent("sdk-reference")}</Markdown>
    </article>
  );
}
