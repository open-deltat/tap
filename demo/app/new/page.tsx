import type { Metadata } from "next";
import { PublicBookableCreate } from "@open-deltat/examples/components/public-bookable-create";
import { pageMetadata } from "@/lib/seo";

export const metadata: Metadata = pageMetadata({
  title: "Make something bookable",
  description:
    "Publish a real bookable timeline on Δt in one form. No account, no password: you get a link to share and a link to keep.",
  path: "/new",
});

export default function NewBookablePage() {
  return <PublicBookableCreate />;
}
