import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Monday = start of week for calendar display */
export function weekStart(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

/** Exclusive end of the week: the half-open bound [weekStart, weekEnd). */
export function weekEnd(date: Date): Date {
  const start = weekStart(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return end;
}

export function weekDays(date: Date): Date[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

export function formatDayShort(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[date.getDay()]} ${date.getDate()}`;
}

export function formatHour(hour: number): string {
  return `${hour.toString().padStart(2, "0")}:00`;
}

export function formatSlotTime(hour: number, minuteOffset: number): string {
  const h = Math.floor(hour + minuteOffset / 60);
  const m = minuteOffset % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

export function dayHourMs(date: Date, hour: number, minute: number = 0): number {
  const d = new Date(date);
  d.setHours(hour, minute, 0, 0);
  return d.getTime();
}
