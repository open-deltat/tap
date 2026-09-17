import Link from "next/link";
import { redirect } from "next/navigation";
import { myBookables, whoAmI } from "@open-deltat/examples/actions/my-bookables";
import { authEnabled, hasSessionCookie } from "@open-deltat/examples/lib/auth-session";
import { CreateCalendar } from "@/components/dashboard/create-calendar";

// The signed-in home. Only reachable when logged in: a genuinely signed-out visitor is sent
// straight to sign-in, while a present-but-unverifiable session shows a prompt (never a loop).

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
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <a
          href="/auth/login?returnTo=/dashboard"
          className="inline-flex w-fit items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Sign in
        </a>
      </main>
    );
  }

  const mine = await myBookables();

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Your calendars</h1>
        <a href="/auth/logout" className="text-sm text-muted-foreground underline">
          Sign out
        </a>
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
          {error === "exchange_failed" || error === "state_mismatch"
            ? "Sign-in did not complete. Try again."
            : error}
        </p>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium">Create a calendar</h2>
          <p className="text-xs text-muted-foreground">
            A live calendar you own that anyone, or any AI agent, can book against.
          </p>
        </div>
        <CreateCalendar />
      </section>

      {mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {mine.length === 1 ? "1 calendar" : `${mine.length} calendars`}
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {mine.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3">
                <span className="flex flex-col">
                  <span className="text-sm">{b.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {b.slotMinutes}-min slots
                    {b.priceCents !== null ? ` · ${(b.priceCents / 100).toFixed(2)} ${b.currency}` : " · free"}
                  </span>
                </span>
                <Link href={`/dashboard/${b.id}`} className="text-sm underline">
                  manage
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
