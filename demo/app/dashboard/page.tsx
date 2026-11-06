import { redirect } from "next/navigation";
import { myBookables, whoAmI } from "@open-deltat/examples/actions/my-bookables";
import { calendarMeetingRequests } from "@open-deltat/examples/actions/meeting-requests";
import { authEnabled, hasSessionCookie } from "@open-deltat/examples/lib/auth-session";
import { Button } from "@open-deltat/examples/components/ui/button";
import { SignOutButton } from "@/components/dashboard/sign-out-button";
import { CalendarList, type CalendarRow } from "@/components/dashboard/calendar-list";
import { ConnectAgent } from "@/components/connect-agent";
import { AmbientBackground } from "@/components/ambient-background";

// The signed-in home: your calendars, and how to have your agent create one. Calendars are created
// only through the hosted MCP, never here. Only reachable when logged in: a genuinely signed-out
// visitor is sent straight to sign-in, while a present-but-unverifiable session shows a prompt
// (never a loop).

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await whoAmI();
  const { error } = await searchParams;

  if (!me) {
    if (!authEnabled()) redirect("/");
    if (!(await hasSessionCookie())) redirect("/auth/login?returnTo=/dashboard");
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-24">
        <h1 className="text-2xl font-semibold">Your dashboard</h1>
        <p className="text-muted-foreground">Your session ended. Sign in again to continue.</p>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button asChild className="w-fit">
          <a href="/auth/login?returnTo=/dashboard">Sign in</a>
        </Button>
      </main>
    );
  }

  const mine = await myBookables();
  const calendars: CalendarRow[] = await Promise.all(
    mine.map(async (b) => {
      if (b.bookingMode !== "request") return { id: b.id, name: b.name, timezone: b.timezone, waiting: null };
      const inbox = await calendarMeetingRequests(b.id);
      return { id: b.id, name: b.name, timezone: b.timezone, waiting: inbox.ok ? inbox.value.filter((r) => r.status === "pending").length : null };
    })
  );

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-12 sm:px-6">
      <AmbientBackground />
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-balance text-[1.75rem] font-semibold tracking-[-0.02em] text-dt-ink">Your calendars</h1>
        <SignOutButton />
      </div>

      {error ? (
        <p className="rounded-xl border border-dt-held/40 bg-dt-held-soft px-3.5 py-2.5 text-sm text-dt-held-ink">
          {error === "exchange_failed" || error === "state_mismatch" ? "Sign-in did not complete. Try again." : error}
        </p>
      ) : null}

      {calendars.length > 0 ? <CalendarList calendars={calendars} /> : null}
      <ConnectAgent />
    </main>
  );
}
