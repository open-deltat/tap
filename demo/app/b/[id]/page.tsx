import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getPublicBookable } from "@open-deltat/examples/actions/public-bookables";
import type { Display } from "@open-deltat/examples/lib/calendar-displays";
import type { BookableRecord } from "@open-deltat/examples/lib/public-bookables";
import { AppointmentsView } from "@/components/booking/appointments-view";

// Calendars made by people's agents are never indexed. Their titles are user-supplied text on our
// domain, so indexing them would make creating calendars worth abusing for links rather than for
// bookings, and it would put moderation of other people's words on the critical path.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// One renderer per view on the list in calendar-displays.ts. Typed over that list, so a view added
// there without a renderer here does not compile.
const VIEWS: Record<Display, (props: { record: BookableRecord }) => Promise<ReactNode>> = {
  appointments: AppointmentsView,
};

export default async function BookablePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const record = await getPublicBookable(id);
  if (!record) notFound();
  const View = VIEWS[record.display];
  return <View record={record} />;
}
