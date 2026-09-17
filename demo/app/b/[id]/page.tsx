import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookable } from "@open-deltat/examples/actions/public-bookables";
import { AppointmentsBooker } from "@/components/booking/appointments-booker";

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

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.name}</h1>
        <p className="text-muted-foreground text-sm">Pick a time that works. Your slot is held while you confirm.</p>
      </div>
      <AppointmentsBooker record={record} />
    </main>
  );
}
