import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { JsonLd } from "@/components/json-ld";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Self-host: run your own node",
  description:
    "Run your own Δt node: one Rust binary, no Postgres underneath, configured entirely through environment variables, with a background reaper that cleans up.",
  path: "/docs/sdk/self-host",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

export default function SelfHostPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is TAP", path: "/docs/sdk" },
            { name: "Self-host", path: "/docs/sdk/self-host" },
          ]),
        ]}
      />
      <DocHeader eyebrow="TAP · the protocol" title="Self-host" />
      <Markdown>{docContent("sdk-self-host")}</Markdown>
    </article>
  );
}
