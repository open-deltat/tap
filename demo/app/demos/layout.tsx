import { PersonalCalendarProvider } from "@/components/personal-calendar-provider";
import { SessionSidebar } from "@/components/session-sidebar";

// A persistent left sidebar shows the visitor's own bookings + a countdown to their auto-clear;
// each demo renders to its right. The personal-calendar provider stays mounted (releaseHoldsThenBook
// still mirrors bookings to calendarId).
export default function DemosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalCalendarProvider>
      <div className="flex h-full">
        <SessionSidebar />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </PersonalCalendarProvider>
  );
}
