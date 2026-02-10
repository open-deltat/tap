import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { SlotPicker } from "@/components/slot-picker";
import { getPublicCalendarInfo } from "@/app/actions/public";

export default async function BookPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const info = await getPublicCalendarInfo(slug);
  if (!info) notFound();

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Book a meeting</CardTitle>
          <CardDescription>
            Schedule a {info.slotMinutes}-minute meeting with {info.displayName}.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SlotPicker slug={slug} slotMinutes={info.slotMinutes} />
        </CardContent>
      </Card>
    </div>
  );
}
