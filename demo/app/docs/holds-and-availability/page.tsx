import { HoldsStatic } from "@/examples/explainer/holds/holds-static";
import { DocHeader } from "@/components/doc-header";
import { DocBody } from "@/components/doc-body";
import { JsonLd } from "@/components/json-ld";
import { VERBS, VerbChip } from "@/components/landing/verbs";
import { docContent } from "@/lib/docs-content";
import { pageMetadata, techArticleLd, breadcrumbLd } from "@/lib/seo";

const SEO = {
  title: "Find, hold, book, listen",
  description:
    "The four steps every booking takes on Δt: find what is free, hold a slot while you ask, book it in one step, and hear every change the moment it happens.",
  path: "/docs/holds-and-availability",
};

export const metadata = pageMetadata({ ...SEO, ogType: "article" });

// Each section opens with its command, in the same colour the landing and the examples give it.
const chip = (i: number) => ({ node: <VerbChip verb={VERBS[i]} />, tight: true });

export default function HoldsAndAvailabilityPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <JsonLd
        graph={[
          techArticleLd(SEO),
          breadcrumbLd([
            { name: "Home", path: "/" },
            { name: "What is Δt", path: "/docs" },
            { name: "Find, hold, book, listen", path: "/docs/holds-and-availability" },
          ]),
        ]}
      />
      <DocHeader title="Find, hold, book, listen" path={SEO.path} />
      <DocBody
        source={docContent("holds-and-availability")}
        slots={{ HOLDS_WIDGET: <HoldsStatic />, FIND: chip(0), HOLD: chip(1), BOOK: chip(2), LISTEN: chip(3) }}
      />
    </article>
  );
}
