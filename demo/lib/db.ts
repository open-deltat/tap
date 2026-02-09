import postgres from "postgres";
import { ulid } from "ulid";
import type { AvailabilitySlot } from "./schemas";

const db = postgres({
  hostname: process.env.DELTAT_HOST ?? "localhost",
  port: Number(process.env.DELTAT_PORT ?? 5433),
  database: process.env.DELTAT_DB ?? "demo",
  username: process.env.DELTAT_USER ?? "user",
  password: process.env.DELTAT_PASSWORD ?? "secret",
  fetch_types: false,
  prepare: false,
});

export async function createResource(
  parentId: string | null
): Promise<string> {
  const id = ulid();
  await db`INSERT INTO resources (id, parent_id) VALUES (${id}, ${parentId})`;
  return id;
}

export async function deleteResource(id: string): Promise<void> {
  await db`DELETE FROM resources WHERE id = ${id}`;
}

export async function addRule(
  resourceId: string,
  start: number,
  end: number,
  blocking: boolean
): Promise<string> {
  const id = ulid();
  await db`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${id}, ${resourceId}, ${start}, ${end}, ${blocking})`;
  return id;
}

export async function deleteRule(id: string): Promise<void> {
  await db`DELETE FROM rules WHERE id = ${id}`;
}

export async function bookSlot(
  resourceId: string,
  start: number,
  end: number
): Promise<string> {
  const id = ulid();
  await db`INSERT INTO bookings (id, resource_id, start, "end") VALUES (${id}, ${resourceId}, ${start}, ${end})`;
  return id;
}

export async function batchBookSlots(
  slots: { resourceId: string; start: number; end: number }[]
): Promise<string[]> {
  if (slots.length === 0) return [];
  if (slots.length === 1) {
    const id = await bookSlot(slots[0].resourceId, slots[0].start, slots[0].end);
    return [id];
  }
  const ids = slots.map(() => ulid());
  const valuesList = ids
    .map(
      (id, i) =>
        `('${id}', '${slots[i].resourceId}', ${slots[i].start}, ${slots[i].end})`
    )
    .join(", ");
  await db.unsafe(
    `INSERT INTO bookings (id, resource_id, start, "end") VALUES ${valuesList}`
  );
  return ids;
}

export async function cancelBooking(id: string): Promise<void> {
  await db`DELETE FROM bookings WHERE id = ${id}`;
}

export async function getAvailability(
  resourceId: string,
  start: number,
  end: number
): Promise<AvailabilitySlot[]> {
  const rows = await db`SELECT * FROM availability WHERE resource_id = ${resourceId} AND start >= ${start} AND "end" <= ${end}`;
  return rows.map((row: Record<string, unknown>) => ({
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
  }));
}

export async function placeHold(
  id: string,
  resourceId: string,
  start: number,
  end: number,
  expiresAt: number
): Promise<void> {
  await db`INSERT INTO holds (id, resource_id, start, "end", expires_at) VALUES (${id}, ${resourceId}, ${start}, ${end}, ${expiresAt})`;
}

export async function releaseHold(id: string): Promise<void> {
  await db`DELETE FROM holds WHERE id = ${id}`;
}

export async function getHoldsForResource(
  resourceId: string
): Promise<{ id: string; resourceId: string; start: number; end: number; expiresAt: number }[]> {
  const rows = await db`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    expiresAt: Number(row.expires_at),
  }));
}

/** Multi-resource availability: find time spans where at least `minAvailable`
 *  of the given resources are simultaneously free.
 *  - minAvailable = ids.length → intersection (ALL must be free)
 *  - minAvailable = 1 → union (ANY one free)
 */
export async function getMultiResourceAvailabilityIntersection(
  resourceIds: string[],
  start: number,
  end: number,
  minAvailable?: number
): Promise<{ start: number; end: number }[]> {
  if (resourceIds.length === 0) return [];
  const inList = resourceIds.map((id) => `'${id}'`).join(", ");
  const minAvail = minAvailable ?? resourceIds.length;
  const sql = `SELECT * FROM availability WHERE resource_id IN (${inList}) AND start >= ${start} AND "end" <= ${end} AND min_available = ${minAvail}`;
  const rows = await db.unsafe(sql);
  return rows.map((row: Record<string, unknown>) => ({
    start: Number(row.start),
    end: Number(row.end),
  }));
}
