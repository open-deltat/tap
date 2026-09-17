import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Globe, Settings2, Trash2 } from "lucide-react";
import { getCalendar } from "@open-deltat/examples/actions/my-bookables";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AvailabilityEditor } from "@/components/dashboard/availability-editor";
import { LiveCalendar } from "@/components/dashboard/live-calendar";
import { CopyLink } from "@/components/dashboard/copy-link";
import { DeleteCalendarButton, RenameField } from "@/components/dashboard/calendar-admin";

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs">
          <ArrowLeft className="size-3.5" /> All calendars
        </Link>
        <RenameField id={id} initialName={record.name} />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1.5">
            <CalendarClock className="size-3" />
            {record.slotMinutes}-minute slots
          </Badge>
          <Badge variant="muted">{formatPrice(record.priceCents, record.currency)}</Badge>
          <Badge variant="muted" className="gap-1.5">
            <Globe className="size-3" />
            {record.timezone}
          </Badge>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Booking link</CardTitle>
          <CardDescription>Share this, or point an AI agent at it. Anyone can book on it.</CardDescription>
        </CardHeader>
        <CardContent>
          <CopyLink path={`/b/${id}`} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Settings2 className="text-muted-foreground size-4" />
            Availability
          </CardTitle>
          <CardDescription>Open hours, slot length, and price. Save to apply.</CardDescription>
        </CardHeader>
        <CardContent>
          <AvailabilityEditor
            id={id}
            initialWeek={record.week}
            initialSlotMinutes={record.slotMinutes}
            initialPriceCents={record.priceCents}
            currency={record.currency}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Live bookings</CardTitle>
          <CardDescription>Updates in real time as bookings and holds happen, over the tap protocol.</CardDescription>
        </CardHeader>
        <CardContent>
          <LiveCalendar
            calendarId={id}
            timezone={record.timezone}
            initialBookings={bookings.map((b) => ({ id: b.id, start: b.start, end: b.end, label: b.label }))}
          />
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trash2 className="text-destructive size-4" />
            Delete calendar
          </CardTitle>
          <CardDescription>Removes the calendar and every booking on it. This cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent>
          <DeleteCalendarButton id={id} name={record.name} />
        </CardContent>
      </Card>
    </main>
  );
}
