import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export const metadata = { title: "What is tap · tap docs" };

export default function WhatIsTapPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="tap · the protocol" title="What is tap" />
      <Markdown>{docContent("what-is-tap")}</Markdown>
    </article>
  );
}
