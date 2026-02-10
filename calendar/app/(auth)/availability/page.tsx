import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScheduleForm } from "@/components/schedule-form";

export default function AvailabilityPage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold mb-6">Availability</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>Weekly Schedule</CardTitle>
          <CardDescription>
            Set your recurring availability. This replaces any existing schedule.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScheduleForm />
        </CardContent>
      </Card>
    </div>
  );
}
