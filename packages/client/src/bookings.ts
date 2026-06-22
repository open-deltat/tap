import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Booking } from "./types.js";

export class Bookings {
  constructor(private readonly sql: Sql) {}

  async create(
    items: {
      resourceId: string;
      start: number;
      end: number;
      label?: string;
    }[]
  ): Promise<Booking[]> {
    if (items.length === 0) return [];

    const bookings: Booking[] = items.map((item) => ({
      id: ulid(),
      resourceId: item.resourceId,
      start: item.start,
      end: item.end,
      label: item.label ?? null,
    }));

    if (bookings.length === 1) {
      const b = bookings[0];
      if (b.label) {
        await this
          .sql`INSERT INTO bookings (id, resource_id, start, "end", label) VALUES (${b.id}, ${b.resourceId}, ${b.start}, ${b.end}, ${b.label})`;
      } else {
        await this
          .sql`INSERT INTO bookings (id, resource_id, start, "end") VALUES (${b.id}, ${b.resourceId}, ${b.start}, ${b.end})`;
      }
    } else {
      const params: (string | number | boolean | null)[] = [];
      const rows: string[] = [];
      for (const b of bookings) {
        const i = params.length;
        params.push(b.id, b.resourceId, b.start, b.end, b.label);
        rows.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
      }

      await this.sql.unsafe(
        `INSERT INTO bookings (id, resource_id, start, "end", label) VALUES ${rows.join(", ")}`,
        params
      );
    }

    return bookings;
  }

  async cancel(id: string): Promise<void> {
    await this.sql`DELETE FROM bookings WHERE id = ${id}`;
  }

  async get(
    resourceId: string,
    filter?: { start?: number; end?: number }
  ): Promise<Booking[]> {
    if (filter?.start != null && filter?.end != null) {
      const rows = await this.sql.unsafe(
        `SELECT * FROM bookings WHERE resource_id = $1 AND start < $2 AND "end" > $3`,
        [resourceId, filter.end, filter.start]
      );
      return rows.map(mapBooking);
    }
    const rows = await this
      .sql`SELECT * FROM bookings WHERE resource_id = ${resourceId}`;
    return rows.map(mapBooking);
  }

  /** Bookings for many resources in one round-trip, grouped by resource id. Every requested id is
   *  present in the result (empty array if it has none), so callers can index without a fallback.
   *  Ids are positional ($N) params, never spliced into the SQL. */
  async getMany(resourceIds: string[]): Promise<Record<string, Booking[]>> {
    const grouped: Record<string, Booking[]> = {};
    for (const id of resourceIds) grouped[id] = [];
    if (resourceIds.length === 0) return grouped;

    const placeholders = resourceIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await this.sql.unsafe(
      `SELECT * FROM bookings WHERE resource_id IN (${placeholders})`,
      [...resourceIds]
    );
    for (const row of rows) {
      const b = mapBooking(row);
      (grouped[b.resourceId] ??= []).push(b);
    }
    return grouped;
  }
}

function mapBooking(row: Record<string, unknown>): Booking {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    label: row.label != null ? String(row.label) : null,
  };
}
