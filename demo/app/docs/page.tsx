import { CollisionToy } from "@/components/collision-toy";
import { DocHeader } from "@/components/doc-header";
import { DocBody } from "@/components/doc-body";
import { JsonLd } from "@/components/json-ld";
import { WithWithout } from "@/components/landing/with-without";
import { Verbs } from "@/components/landing/verbs";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "What is Δt? A calendar for agents",
  description:
    "Δt is a calendar people and agents book on at the same moment: find what is free, hold a slot while you ask, book it in one step, and every screen sees it at once.",
  path: "/docs",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article", absoluteTitle: true });

export default function WhatIsDeltatPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
          ]),
        ]}
      />
      <DocHeader title="What is Δt" path={SEO.path} />
      <DocBody
        source={docContent("what-is-deltat")}
        slots={{
          WITH_WITHOUT: <WithWithout className="" />,
          VERBS: <Verbs columns={2} />,
          COLLISION: <CollisionToy />,
        }}
      />
    </article>
  );
}
