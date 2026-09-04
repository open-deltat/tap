import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookable } from "@open-deltat/examples/actions/public-bookables";
import { PublicBookableBooker } from "@open-deltat/examples/components/public-bookable-booker";

// Stranger-created pages are never indexed. Their titles are user-supplied text on our domain, so
// indexing them would make the create form worth abusing for links rather than for bookings, and it
// would put moderation of other people's words on the critical path of shipping this at all.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function BookablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getPublicBookable(id);
  if (!record) notFound();
  return <PublicBookableBooker record={record} />;
}
