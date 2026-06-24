import { OverviewTopic } from "@/examples/explainer/overview";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export default function DocsOverviewPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="Overview" />
      <p className="text-[14px] leading-relaxed text-zinc-400">
        Start here. This page is orientation only, no API. It explains the one idea Δt is built on and points you at the rest of the docs.
      </p>
      <div className="mt-6">
        <OverviewTopic />
      </div>
      <Markdown>{docContent("overview")}</Markdown>
    </article>
  );
}
