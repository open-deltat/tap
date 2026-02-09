import { Plane, Theater, LandPlot, Calendar, CalendarClock, Clock } from "lucide-react";

const DEMOS = [
  {
    href: "/demos/airline",
    icon: Plane,
    title: "Airline",
    description: "Flight seat selection with cabins, rows, and buffer times",
  },
  {
    href: "/demos/theater",
    icon: Theater,
    title: "Theater",
    description: "Show seat booking with sections and recurring schedules",
  },
  {
    href: "/demos/stadium",
    icon: LandPlot,
    title: "Stadium",
    description: "Event seat booking with tiered pricing and capacity",
  },
  {
    href: "/demos/calendar",
    icon: Calendar,
    title: "Calendar",
    description: "Resource management with week and day views",
  },
  {
    href: "/demos/scheduling",
    icon: CalendarClock,
    title: "Scheduling",
    description: "Find combined availability across multiple resources",
  },
  {
    href: "/demos/holds",
    icon: Clock,
    title: "Holds",
    description: "Temporary reservations with auto-expiry countdowns",
  },
];

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4">
      <div className="max-w-3xl w-full space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-4xl font-bold tracking-tight">Δt</h1>
          <p className="text-muted-foreground">
            A time-allocation database that speaks PostgreSQL wire protocol.
            <br />
            Sub-millisecond availability queries. Zero external dependencies.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {DEMOS.map(({ href, icon: Icon, title, description }) => (
            <a
              key={href}
              href={href}
              className="group rounded-lg border p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-center gap-2 mb-1.5">
                <Icon className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                <span className="font-medium text-sm">{title}</span>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {description}
              </p>
            </a>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          All demos use seed data. Data resets when the server restarts.
        </p>
      </div>
    </div>
  );
}
