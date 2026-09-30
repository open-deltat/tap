import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPublicBookable } from "@open-deltat/examples/actions/public-bookables";
import { myContact, myMeetingRequests } from "@open-deltat/examples/actions/meeting-requests";
import { authEnabled, getSessionPrincipal } from "@open-deltat/examples/lib/auth-session";
import { liveProtectedResourceMetadata } from "@open-deltat/examples/lib/mcp-live";
import { AppointmentsBooker } from "@/components/booking/appointments-booker";
import { MeetingRequester } from "@/components/booking/meeting-requester";
import { AmbientBackground } from "@/components/ambient-background";

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

  if (record.bookingMode === "request") {
    const signedIn = (await getSessionPrincipal()) !== null;
    const signInHref = signedIn || !authEnabled() ? null : `/auth/login?returnTo=${encodeURIComponent(`/b/${id}`)}`;
    const [contact, requests] = signedIn ? await Promise.all([myContact(), myMeetingRequests(id)]) : [null, []];
    const mcp = liveProtectedResourceMetadata();
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
        <AmbientBackground />
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{record.name}</h1>
          <p className="text-muted-foreground text-sm">
            Ask for a time that works. The owner confirms each meeting; nothing is booked until they do.
          </p>
        </div>
        <MeetingRequester record={record} signInHref={signInHref} contact={contact} initialRequests={requests} />
        {mcp ? (
          <p className="text-muted-foreground text-xs">
            Using an AI assistant? Add <code>{mcp.resource}</code> as an MCP connector and ask it to request a meeting on
            calendar <code>{id}</code>.
          </p>
        ) : null}
      </main>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <AmbientBackground />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.name}</h1>
        <p className="text-muted-foreground text-sm">Pick a time that works. Your slot is held while you confirm.</p>
      </div>
      <AppointmentsBooker record={record} />
    </main>
  );
}
