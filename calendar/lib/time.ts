export function toLocalDateString(date: Date): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60000);
  return local.toISOString().slice(0, 10);
}

export function formatTime(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function dayBounds(date: Date): { dayStart: number; dayEnd: number } {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dayStart = d.getTime();
  return { dayStart, dayEnd: dayStart + 86_400_000 };
}
