import { PersonalCalendarProvider } from "@/components/personal-calendar-provider";
import { PersonalCalendarSidebar } from "@/components/personal-calendar-sidebar";

export default function DemosLayout({ children }: { children: React.ReactNode }) {
  return (
    <PersonalCalendarProvider>
      <div className="flex h-full">
        <div className="flex-1 min-w-0">{children}</div>
        <PersonalCalendarSidebar />
      </div>
    </PersonalCalendarProvider>
  );
}

