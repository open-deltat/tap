import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, Plus } from "lucide-react";
import { myBookables, whoAmI } from "@open-deltat/examples/actions/my-bookables";
import { authEnabled, hasSessionCookie } from "@open-deltat/examples/lib/auth-session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@open-deltat/examples/components/ui/button";
import { CreateCalendar } from "@/components/dashboard/create-calendar";
import { SignOutButton } from "@/components/dashboard/sign-out-button";

// The signed-in home. Only reachable when logged in: a genuinely signed-out visitor is sent
// straight to sign-in, while a present-but-unverifiable session shows a prompt (never a loop).

export const metadata = { title: "Dashboard" };

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "Free";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

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
        <Button asChild className="w-fit">
          <a href="/auth/login?returnTo=/dashboard">Sign in</a>
        </Button>
      </main>
    );
  }

  const mine = await myBookables();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-6 py-12">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Your calendars</h1>
          <p className="text-muted-foreground text-sm">
            Real-time calendars anyone, or any AI agent, can book against.
          </p>
        </div>
        <SignOutButton />
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40">
          {error === "exchange_failed" || error === "state_mismatch" ? "Sign-in did not complete. Try again." : error}
        </p>
      ) : null}

      {/* Your calendars first: click one to open its live page. */}
      {mine.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {mine.map((b) => (
            <Link key={b.id} href={`/dashboard/${b.id}`} className="group">
              <Card className="gap-0 py-0 transition-colors group-hover:border-foreground/30">
                <CardContent className="flex items-center gap-3 py-4">
                  <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                    <CalendarDays className="size-4" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-sm font-medium">{b.name}</span>
                    <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
                      <Badge variant="muted">{b.slotMinutes}m</Badge>
                      <span>{formatPrice(b.priceCents, b.currency)}</span>
                    </span>
                  </span>
                  <ArrowRight className="text-muted-foreground size-4 shrink-0 transition-transform group-hover:translate-x-0.5" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-muted-foreground rounded-xl border border-dashed px-6 py-12 text-center text-sm">
          No calendars yet. Create your first below.
        </div>
      )}

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Plus className="text-muted-foreground size-4" />
            <h2 className="text-sm font-medium">Create a calendar</h2>
          </div>
          <CreateCalendar />
          <p className="text-muted-foreground text-xs">Next you&apos;ll set its hours, slot length, and price.</p>
        </CardContent>
      </Card>
    </main>
  );
}
