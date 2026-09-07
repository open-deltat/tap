import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { authorizePublicBookable } from "@open-deltat/examples/actions/public-bookables";
import { PublicBookableManage } from "@open-deltat/examples/components/public-bookable-manage";

// The manage key is in the path, so this page must not leak it outward. `no-referrer` keeps it out
// of the Referer header on any outbound click, and noindex keeps it out of search results if the
// owner ever pastes the link somewhere a crawler reads.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function ManageBookablePage({
  params,
}: {
  params: Promise<{ id: string; key: string }>;
}) {
  const { id, key } = await params;
  // A wrong key is indistinguishable from a missing bookable on purpose: probing this route should
  // never confirm that an id exists.
  const record = await authorizePublicBookable(id, key);
  if (!record) notFound();
  return <PublicBookableManage record={record} manageKey={key} />;
}
