import { dt } from "@/lib/deltat";
import { config } from "@/lib/config";

// The single home of the `cal:<slug>` resource-name convention (was rebuilt inline in 3 places).
export function calendarResourceName(slug: string = config.slug): string {
  return `cal:${slug}`;
}

// Resolve a calendar root by slug without creating it; null if it doesn't exist yet.
export async function findCalendarResource(slug: string = config.slug): Promise<string | null> {
  const roots = await dt.resources.get({ roots: true });
  return roots.find((r) => r.name === calendarResourceName(slug))?.id ?? null;
}

// Resolve-or-create this calendar's own root resource, memoized for the process: the id never
// changes once created, so every authenticated action shares one lookup instead of re-fetching all
// roots on each call. Server-only helper, not a Server Action (callers already authenticate).
let cachedId: string | null = null;
export async function ensureCalendarResource(): Promise<string> {
  if (cachedId) return cachedId;
  const existing = await findCalendarResource();
  if (existing) {
    cachedId = existing;
    return existing;
  }
  const created = await dt.resources.create({ name: calendarResourceName(), capacity: 1 });
  cachedId = created.id;
  return created.id;
}
