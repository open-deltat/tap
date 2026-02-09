import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Date helpers

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Get Monday 00:00 of the week containing `date` */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  // JS getDay: 0=Sun, 1=Mon. We want Monday as start.
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Get Sunday 23:59:59.999 of the week containing `date` */
export function weekEnd(date: Date): Date {
  const start = weekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  end.setMilliseconds(-1);
  return end;
}

/** Get the 7 days of the week starting from Monday */
export function weekDays(date: Date): Date[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Format a date as "Mon 3" */
export function formatDayShort(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

/** Format hour as "09:00" */
export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

/** Format time slot as "09:00", "09:15" etc */
export function formatSlotTime(hour: number, minuteOffset: number): string {
  const h = Math.floor(hour + minuteOffset / 60);
  const m = minuteOffset % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

/** Get unix ms for a specific hour and minute on a specific day */
export function dayHourMs(date: Date, hour: number, minute: number = 0): number {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}
