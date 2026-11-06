import type { Metadata } from "next";
import { PublicBookableCreate } from "@open-deltat/examples/components/public-bookable-create";
import { JsonLd } from "@/components/json-ld";
import { pageMetadata, webPageLd } from "@/lib/seo";

const SEO = {
  title: "Make something bookable",
  description:
    "Publish a real bookable timeline on Δt in one form. No account, no password: you get a link to share and a link to keep.",
  path: "/new",
};

export const metadata: Metadata = pageMetadata(SEO);

export default function NewBookablePage() {
  return (
    <>
      <JsonLd graph={[webPageLd(SEO)]} />
      {/* The page's one h1, in the server HTML; the form's visible title is an h2 inside it. */}
      <h1 className="sr-only">{SEO.title}</h1>
      <PublicBookableCreate />
    </>
  );
}
