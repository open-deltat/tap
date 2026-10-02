export function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

// One range in the viewer's locale, with the shared meridiem collapsed ("10:00 – 10:30 AM"), so it
// fits on one line on a phone and never reads "AM to AM".
export function formatTimeRange(start: number, end: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).formatRange(start, end);
}

export function dayBounds(date: Date): { dayStart: number; dayEnd: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayStart = d.getTime();
  return { dayStart, dayEnd: dayStart + 86_400_000 };
}
