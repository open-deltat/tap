"use client";

import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Plane,
  Theater,
  LandPlot,
  Calendar,
  CalendarClock,
  BookOpen,
  Sun,
  Moon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/demos/airline", label: "Airline", icon: Plane },
  { href: "/demos/theater", label: "Theater", icon: Theater },
  { href: "/demos/stadium", label: "Stadium", icon: LandPlot },
  { href: "/demos/calendar", label: "Calendar", icon: Calendar },
  { href: "/demos/scheduling", label: "Scheduling", icon: CalendarClock },
  { href: "/bookings", label: "Bookings", icon: BookOpen },
];

export function NavHeader() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();

  return (
    <header className="flex items-center justify-between border-b px-4 py-1.5 shrink-0">
      {/* Brand */}
      <a href="/" className="text-sm font-semibold tracking-tight select-none">
        Δt
      </a>

      {/* Navigation */}
      <nav className="flex items-center gap-1">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname.startsWith(href);
          return (
            <a
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition-colors",
                active
                  ? "bg-accent font-medium text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </a>
          );
        })}
      </nav>

      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8"
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  );
}
