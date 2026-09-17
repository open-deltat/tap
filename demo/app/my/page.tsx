import Link from "next/link";
import { redirect } from "next/navigation";
import { createMyBookable, myBookables, whoAmI } from "@open-deltat/examples/actions/my-bookables";
import { TimezoneField } from "@/components/my/timezone-field";

// The signed-in home: the moment you are in, the only question is "what's your scheduler called?".
// Creation lands you on the manage page (same page the secret-link flow uses), and this page keeps
// the list so a lost link is no longer a lost calendar.

export const metadata = { title: "My schedulers" };

async function createAction(formData: FormData) {
  "use server";
  const name = String(formData.get("name") ?? "");
  const timezone = String(formData.get("timezone") ?? "UTC");
  const created = await createMyBookable({ name, timezone });
  if (!created.ok) redirect(`/my?error=${encodeURIComponent(created.error)}`);
  redirect(`/b/${created.id}/manage/${created.manageKey}`);
}

export default async function MyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const me = await whoAmI();
  const { error } = await searchParams;

  if (!me) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-6 px-6 py-24">
        <h1 className="text-2xl font-semibold">Your AI scheduler</h1>
        <p className="text-muted-foreground">
          Sign in to create a scheduler and keep every calendar you make in one place.
        </p>
        {error ? <p className="text-sm text-red-600">Sign-in failed: {error}</p> : null}
        <a
          href="/auth/login"
          className="inline-flex w-fit items-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Sign in
        </a>
      </main>
    );
  }

  const mine = await myBookables();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-8 px-6 py-16">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold">My schedulers</h1>
        <a href="/auth/logout" className="text-sm text-muted-foreground underline">
          Sign out
        </a>
      </div>

      <form action={createAction} className="flex flex-col gap-3 rounded-lg border p-4">
        <label htmlFor="name" className="text-sm font-medium">
          What&apos;s your scheduler called?
        </label>
        <input
          id="name"
          name="name"
          required
          maxLength={60}
          placeholder="e.g. Haircuts at Simon's"
          className="rounded-md border px-3 py-2 text-sm"
        />
        <TimezoneField />
        <button
          type="submit"
          className="w-fit rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background"
        >
          Create scheduler
        </button>
        <p className="text-xs text-muted-foreground">
          Starts with weekday hours and 30-minute slots; tune everything on the next page.
        </p>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
      </form>

      {mine.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {mine.length === 1 ? "1 scheduler" : `${mine.length} schedulers`}
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
        </div>
      ) : null}
    </main>
  );
}
