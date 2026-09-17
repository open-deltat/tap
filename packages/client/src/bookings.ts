import type { Sql } from "postgres";
import { ulid } from "ulid";
import { MAX_IN_CLAUSE_IDS, chunk } from "./chunk.js";
import type { Booking } from "./types.js";

export class Bookings {
  constructor(private readonly sql: Sql) {}

  /**
   * Create one or more bookings in a single round-trip. All-or-nothing: if any item conflicts, the
   * whole batch is rejected and nothing persists, so a multi-seat purchase can't half-commit. Times
   * are Unix ms over `[start, end)`.
   */
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
      if (b.label != null) {
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

  /** Cancel (delete) a booking by id. */
  async cancel(id: string): Promise<void> {
    await this.sql`DELETE FROM bookings WHERE id = ${id}`;
  }

  /**
   * Bookings for one resource. An optional `{ start, end }` keeps only those overlapping the
   * half-open window. The predicate is pushed down to the kernel and applied again client-side,
   * so the result is correct against kernels older than the span-predicate fix too.
   */
  async get(
    resourceId: string,
    filter?: { start?: number; end?: number }
  ): Promise<Booking[]> {
    // Pushed down to the kernel, which honours span predicates (it used to drop them silently,
    // which is why this filtered client-side). The window is a half-open OVERLAP, so it asks for
    // rows that begin before the window ends and end after it begins, not containment.
    const start = filter?.start;
    const end = filter?.end;
    if (start == null || end == null) {
      const rows = await this.sql`SELECT * FROM bookings WHERE resource_id = ${resourceId}`;
      return rows.map(mapBooking);
    }
    const rows = await this.sql.unsafe(
      `SELECT * FROM bookings WHERE resource_id = $1 AND start < $2 AND "end" > $3`,
      [resourceId, end, start]
    );
    // The same window applied again client-side. Against a kernel that honours the predicate this
    // is a no-op; against one older than the fix (which dropped span predicates silently) it is
    // what keeps the result correct. An SDK is used against server versions it did not choose.
    return rows.map(mapBooking).filter((b) => b.start < end && b.end > start);
  }

  /** Bookings for many resources in one round-trip, grouped by resource id. Every requested id is
   *  present in the result (empty array if it has none), so callers can index without a fallback.
   *  Ids are positional ($N) params, never spliced into the SQL. */
  async getMany(resourceIds: string[]): Promise<Record<string, Booking[]>> {
    const grouped: Record<string, Booking[]> = {};
    for (const id of resourceIds) grouped[id] = [];
    if (resourceIds.length === 0) return grouped;

    const batches = await Promise.all(
      chunk(resourceIds, MAX_IN_CLAUSE_IDS).map((ids) => {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        return this.sql.unsafe(
          `SELECT * FROM bookings WHERE resource_id IN (${placeholders})`,
          [...ids]
        );
      })
    );
    for (const rows of batches) {
      for (const row of rows) {
        const b = mapBooking(row);
        (grouped[b.resourceId] ??= []).push(b);
      }
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
