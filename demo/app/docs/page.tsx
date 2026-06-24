import { CollisionToy } from "@/components/collision-toy";
import { DocHeader } from "@/components/doc-header";
import { Markdown } from "@/components/markdown";
import { docContent } from "@/lib/docs-content";

export default function WhatIsDeltatPage() {
  const [before, after] = docContent("what-is-deltat").split("<!--COLLISION-->");
  return (
    <article className="mx-auto max-w-3xl">
      <DocHeader eyebrow="Δt · the database" title="What is Δt" />
      <Markdown>{before}</Markdown>
      <div className="my-2">
        <CollisionToy />
      </div>
      <Markdown>{after}</Markdown>
    </article>
  );
}
