import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, CalendarClock, Globe, ListChecks, Settings2, Tag } from "lucide-react";
import { getCalendar } from "@open-deltat/examples/actions/my-bookables";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AvailabilityEditor } from "@/components/dashboard/availability-editor";
import { LiveSchedule } from "@/components/dashboard/live-schedule";
import { ShareDialog } from "@/components/dashboard/share-dialog";
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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 py-8">
      {/* Header: identity + stats + the rarely-used actions tucked to the right. */}
      <div className="flex flex-col gap-3">
        <Link href="/dashboard" className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-xs">
          <ArrowLeft className="size-3.5" /> All calendars
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <RenameField id={id} initialName={record.name} />
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1.5">
                <CalendarClock className="size-3" /> {record.slotMinutes}-min slots
              </Badge>
              <Badge variant="muted" className="gap-1.5">
                <Tag className="size-3" /> {formatPrice(record.priceCents, record.currency)}
              </Badge>
              <Badge variant="muted" className="gap-1.5">
                <Globe className="size-3" /> {record.timezone}
              </Badge>
            </div>
          </div>
          <div className="shrink-0">
            <ShareDialog path={`/b/${id}`} />
          </div>
        </div>
      </div>

      {/* Bookings first: it's what an operator looks at daily. Availability and settings behind tabs. */}
      <Tabs defaultValue="bookings">
        <TabsList className="w-full sm:w-auto">
          <TabsTrigger value="bookings">
            <ListChecks /> Bookings
          </TabsTrigger>
          <TabsTrigger value="availability">
            <CalendarClock /> Availability
          </TabsTrigger>
          <TabsTrigger value="settings">
            <Settings2 /> Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="pt-2">
          <LiveSchedule
            calendarId={id}
            timezone={record.timezone}
            week={record.week}
            initialBookings={bookings.map((b) => ({ id: b.id, start: b.start, end: b.end, label: b.label }))}
          />
        </TabsContent>

        <TabsContent value="availability" className="pt-2">
          <AvailabilityEditor
            id={id}
            initialWeek={record.week}
            initialSlotMinutes={record.slotMinutes}
            initialPriceCents={record.priceCents}
            currency={record.currency}
          />
        </TabsContent>

        <TabsContent value="settings" className="flex flex-col gap-6 pt-2">
          <p className="text-muted-foreground text-sm">
            Edit the name inline in the header above. Timezone ({record.timezone}) is set from your
            browser at creation.
          </p>
          <div className="flex flex-col gap-2 border-t pt-6">
            <h3 className="text-destructive flex items-center gap-2 text-sm font-medium">Delete calendar</h3>
            <p className="text-muted-foreground text-xs">Removes the calendar and every booking on it. This cannot be undone.</p>
            <DeleteCalendarButton id={id} name={record.name} />
          </div>
        </TabsContent>
      </Tabs>
    </main>
  );
}
