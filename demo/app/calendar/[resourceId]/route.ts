import { dt } from "@open-deltat/examples/lib/deltat";
import { renderCalendar, type IcsEvent } from "@/lib/ics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAST_MS = 30 * 24 * 60 * 60 * 1000;
const FUTURE_MS = 180 * 24 * 60 * 60 * 1000;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ resourceId: string }> }
) {
  const { resourceId } = await params;
  const now = Date.now();
  const windowStart = now - PAST_MS;
  const windowEnd = now + FUTURE_MS;

  const [resources, bookings, rules] = await Promise.all([
    dt.resources.get(),
    dt.bookings.get(resourceId, { start: windowStart, end: windowEnd }),
    dt.rules.get(resourceId),
  ]);

  const resource = resources.find((r) => r.id === resourceId);
  if (!resource) {
    return new Response("Unknown resource", { status: 404 });
  }

  // Free-busy only: this feed is an unauthenticated public URL, so never emit
  // booking labels (PII). A published calendar shows *when* a resource is busy,
  // not what for, matches the deltat export contract (ADAPTERS.md, lossy-by-design).
  const events: IcsEvent[] = bookings.map((b) => ({
    uid: `${b.id}@deltat`,
    start: b.start,
    end: b.end,
    summary: "Booked",
  }));

  for (const r of rules) {
    if (!r.blocking) continue;
    if (r.end <= windowStart || r.start >= windowEnd) continue;
    events.push({
      uid: `${r.id}@deltat`,
      start: r.start,
      end: r.end,
      summary: "Unavailable",
    });
  }

  const name = resource.name ?? `deltat ${resourceId.slice(0, 8)}`;
  const body = renderCalendar({
    name,
    description: "Published by deltat. deltat is the source of truth.",
    events,
    now,
  });

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": `inline; filename="deltat-${resourceId}.ics"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
