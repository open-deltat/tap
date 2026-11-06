import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

// The signed-in owner's calendars, one row each: the name opens its management page, the time zone
// and any meeting requests waiting sit under it, and its public booking page is one click away.

export interface CalendarRow {
  id: string;
  name: string;
  timezone: string;
  /** Requests waiting for an answer; null for a calendar that books directly. */
  waiting: number | null;
}

const waitingLabel = (n: number) => (n === 0 ? "No requests waiting" : `${n} ${n === 1 ? "request" : "requests"} waiting`);

export function CalendarList({ calendars }: { calendars: readonly CalendarRow[] }) {
  return (
    <ul className="overflow-hidden rounded-3xl border border-dt-line bg-dt-surface shadow-dt-surface">
      {calendars.map((c, i) => (
        <li key={c.id} className={i > 0 ? "border-t border-dt-line" : undefined}>
          <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
            <Link href={`/dashboard/c/${c.id}`} className="group min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-dt-ink underline-offset-4 group-hover:underline">{c.name}</span>
              <span className="mt-0.5 block text-[13px] text-dt-ink-3">
                {c.timezone.replaceAll("_", " ")}
                {c.waiting === null ? null : (
                  <>
                    {" · "}
                    <span className={c.waiting > 0 ? "font-medium text-dt-ink" : undefined}>{waitingLabel(c.waiting)}</span>
                  </>
                )}
              </span>
            </Link>
            <Link
              href={`/b/${c.id}`}
              className="inline-flex shrink-0 items-center gap-1 text-[13.5px] font-medium text-dt-ink-2 transition-colors hover:text-dt-ink"
            >
              Booking page
              <ArrowUpRight className="size-3.5" />
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
