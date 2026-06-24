import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Quickstart: the tap TypeScript SDK",
  description:
    "From zero to a confirmed booking with the tap SDK: connect to a node, create a resource, open hours, check availability, place a hold, then confirm the booking.",
  path: "/docs/sdk/quickstart",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function QuickstartPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is tap", path: "/docs/sdk" },
            { name: "Quickstart", path: "/docs/sdk/quickstart" },
          ]),
        ]}
      />
      <DocHeader eyebrow="tap · the protocol" title="Quickstart" />
      <Markdown>{docContent("sdk-quickstart")}</Markdown>
    </article>
  );
}
