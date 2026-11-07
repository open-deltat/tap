import type { BookableRecord } from "@open-deltat/examples/lib/public-bookables";
import { myContact, myMeetingRequests } from "@open-deltat/examples/actions/meeting-requests";
import { authEnabled, getSessionPrincipal, getSignInContact } from "@open-deltat/examples/lib/auth-session";
import { liveProtectedResourceMetadata } from "@open-deltat/examples/lib/mcp-live";
import { AppointmentsBooker } from "@/components/booking/appointments-booker";
import { MeetingRequester } from "@/components/booking/meeting-requester";
import { AmbientBackground } from "@/components/ambient-background";
import { prefillFrom } from "@/components/booking/prefill";

// The `appointments` view of a calendar's public booking page: a month and the chosen day's free
// times. A calendar that takes meeting requests asks instead of booking.
export async function AppointmentsView({ record }: { record: BookableRecord }) {
  if (record.bookingMode === "request") {
    const signedIn = (await getSessionPrincipal()) !== null;
    const signInHref = signedIn || !authEnabled() ? null : `/auth/login?returnTo=${encodeURIComponent(`/b/${record.id}`)}`;
    const [contact, requests] = signedIn ? await Promise.all([myContact(), myMeetingRequests(record.id)]) : [null, []];
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
            calendar <code>{record.id}</code>.
          </p>
        ) : null}
      </main>
    );
  }

  // A signed-in visitor's name and email start the form: what sign-in kept (no network), else, for a
  // session from before that was kept, the identity provider's userinfo where it answers.
  const contact = (await getSignInContact()) ?? ((await getSessionPrincipal()) !== null ? await myContact() : null);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-12">
      <AmbientBackground />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{record.name}</h1>
        <p className="text-muted-foreground text-sm">Pick a time that works. Your slot is held while you confirm.</p>
      </div>
      <AppointmentsBooker record={record} prefill={prefillFrom(contact)} />
    </main>
  );
}
