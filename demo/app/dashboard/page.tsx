import Link from "next/link";
import { myBookables, whoAmI } from "@open-deltat/examples/actions/my-bookables";
import { SCHEDULER_TEMPLATES } from "@open-deltat/examples/lib/scheduler-templates";
import { enabledExamples } from "@open-deltat/examples/manifest";
import { TemplatePicker } from "@/components/dashboard/template-picker";

// The signed-in home. Sign in through the nav Dashboard button and this is where you land: pick a
// template, get a real owned scheduler, and see everything you have made. Signed-out visitors are
// sent to sign in and returned straight back here.

export const metadata = { title: "Dashboard" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await whoAmI();
  const { error } = await searchParams;

  // Rendered inline rather than redirected, so a session that will not verify shows a prompt
  // instead of a redirect loop back to sign-in.
  if (!me) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-24">
        <h1 className="text-2xl font-semibold">Your dashboard</h1>
        <p className="text-muted-foreground">
          Sign in to create schedulers and keep every calendar you make in one place.
        </p>
        {error ? (
          <p className="text-sm text-red-600">
            {error === "exchange_failed" || error === "state_mismatch"
              ? "Sign-in did not complete. Try again."
              : error}
          </p>
        ) : null}
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
  // The seat-map and multi-resource examples are not yet owned-instantiable; surface them as live
  // demos to explore rather than hiding them.
  const exploreOnly = enabledExamples().filter((e) => e.group !== "featured").slice(0, 6);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-12">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">Create a scheduler</h1>
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

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Which one do you want to make?</h2>
          <p className="text-xs text-muted-foreground">
            Each one creates a real, bookable calendar you own. Tune the hours after.
          </p>
        </div>
        <TemplatePicker templates={SCHEDULER_TEMPLATES} />
      </section>

      {mine.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {mine.length === 1 ? "Your scheduler" : `Your ${mine.length} schedulers`}
          </h2>
          <ul className="flex flex-col divide-y rounded-lg border">
            {mine.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">{b.name}</span>
                <Link href={`/b/${b.id}`} className="text-sm underline">
                  open
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground">More shapes to explore</h2>
          <p className="text-xs text-muted-foreground">
            Seat maps, rooms, and pools run as live demos. Owned versions are coming.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {exploreOnly.map((e) => (
            <Link
              key={e.id}
              href={e.href}
              className="rounded-md border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
            >
              {e.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
