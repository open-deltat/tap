import { dt } from "@/lib/deltat";
import { config } from "@/lib/config";

const resourceName = `cal:${config.slug}`;

// Server-only helper, not a Server Action: it is called by already-authenticated actions, so it
// must not be an independently invocable POST endpoint (which a "use server" export would be).
export async function ensureCalendarResource(): Promise<string> {
  const roots = await dt.resources.get({ roots: true });
  const existing = roots.find((r) => r.name === resourceName);
  if (existing) return existing.id;

  const created = await dt.resources.create({ name: resourceName, capacity: 1 });
  return created.id;
}
