import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Booking } from "./types.js";

export class Bookings {
  constructor(private readonly sql: Sql) {}

  async create(opts: {
    resourceId: string;
    start: number;
    end: number;
    label?: string;
  }): Promise<Booking> {
    const id = ulid();
    const label = opts.label ?? null;

    if (label) {
      await this
        .sql`INSERT INTO bookings (id, resource_id, start, "end", label) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${label})`;
    } else {
      await this
        .sql`INSERT INTO bookings (id, resource_id, start, "end") VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end})`;
    }

    return { id, resourceId: opts.resourceId, start: opts.start, end: opts.end, label };
  }

  async createMany(
    items: {
      resourceId: string;
      start: number;
      end: number;
      label?: string;
    }[]
  ): Promise<Booking[]> {
    if (items.length === 0) return [];
    if (items.length === 1) return [await this.create(items[0])];

    const bookings: Booking[] = items.map((item) => ({
      id: ulid(),
      resourceId: item.resourceId,
      start: item.start,
      end: item.end,
      label: item.label ?? null,
    }));

    const valuesList = bookings
      .map(
        (b) =>
          `('${b.id}', '${b.resourceId}', ${b.start}, ${b.end}, ${b.label === null ? "NULL" : `'${b.label.replace(/'/g, "''")}'`})`
      )
      .join(", ");

    await this.sql.unsafe(
      `INSERT INTO bookings (id, resource_id, start, "end", label) VALUES ${valuesList}`
    );

    return bookings;
  }

  async cancel(id: string): Promise<void> {
    await this.sql`DELETE FROM bookings WHERE id = ${id}`;
  }

  async get(resourceId: string): Promise<Booking[]> {
    const rows = await this
      .sql`SELECT * FROM bookings WHERE resource_id = ${resourceId}`;
    return rows.map(mapBooking);
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
