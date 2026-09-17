import Link from "next/link";
import { notFound } from "next/navigation";
import { getCalendar } from "@open-deltat/examples/actions/my-bookables";
import { AvailabilityEditor } from "@/components/dashboard/availability-editor";
import {
  CancelBookingButton,
  DeleteCalendarButton,
  RenameField,
} from "@/components/dashboard/calendar-admin";

export const metadata = { title: "Manage calendar" };

function formatPrice(cents: number | null, currency: string): string {
  if (cents === null) return "Free";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export default async function ManageCalendarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await getCalendar(id);
  if (!result.ok) notFound();
  const { record, bookings } = result.value;

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-10 px-6 py-12">
      <div className="flex flex-col gap-2">
        <Link href="/dashboard" className="w-fit text-xs text-muted-foreground underline">
          ← All calendars
        </Link>
        <RenameField id={id} initialName={record.name} />
        <p className="text-sm text-muted-foreground">
          {record.slotMinutes}-minute slots · {formatPrice(record.priceCents, record.currency)} ·{" "}
          {record.timezone}
        </p>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link href={`/b/${id}`} className="underline">
            Open the public booking page
          </Link>
          <span className="text-muted-foreground">Anyone, or any AI agent, can book on it.</span>
        </div>
      </div>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-medium">Availability</h2>
          <p className="text-xs text-muted-foreground">
            Set the open hours, how long each slot is, and the price. Save to apply.
          </p>
        </div>
        <AvailabilityEditor
          id={id}
          initialWeek={record.week}
          initialSlotMinutes={record.slotMinutes}
          initialPriceCents={record.priceCents}
          currency={record.currency}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">
          {bookings.length === 0
            ? "No bookings yet"
            : bookings.length === 1
              ? "1 booking"
              : `${bookings.length} bookings`}
        </h2>
        {bookings.length > 0 ? (
          <ul className="flex flex-col divide-y rounded-lg border">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <span>
                  {new Date(b.start).toLocaleString(undefined, { timeZone: record.timezone })}
                  {b.label ? ` · ${b.label}` : ""}
                </span>
                <CancelBookingButton id={id} bookingId={b.id} />
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="border-t pt-6">
        <DeleteCalendarButton id={id} name={record.name} />
      </section>
    </main>
  );
}
