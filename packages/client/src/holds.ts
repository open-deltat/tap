import type { Sql } from "postgres";
import { ulid } from "ulid";
import { MAX_IN_CLAUSE_IDS, chunk } from "./chunk.js";
import type { Hold } from "./types.js";

export class Holds {
  constructor(private readonly sql: Sql) {}

  /**
   * Place a hold over `[start, end)` that reserves the resource until `expiresAt` (Unix ms), when the
   * server reaper releases it automatically. A hold removes availability but is not a booking; to
   * keep the slot, create a booking and then release the hold.
   */
  async place(opts: {
    resourceId: string;
    start: number;
    end: number;
    expiresAt: number;
  }): Promise<Hold> {
    const id = ulid();

    await this
      .sql`INSERT INTO holds (id, resource_id, start, "end", expires_at) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${opts.expiresAt})`;

    return {
      id,
      resourceId: opts.resourceId,
      start: opts.start,
      end: opts.end,
      expiresAt: opts.expiresAt,
    };
  }

  /** Release a hold by id before it expires. Expiry is otherwise automatic via the server reaper. */
  async release(id: string): Promise<void> {
    await this.sql`DELETE FROM holds WHERE id = ${id}`;
  }

  /**
   * Holds for one resource, optionally filtered client-side to those overlapping a half-open
   * `{ start, end }` window (the kernel ignores range predicates in SELECTs). Not-yet-reaped expired
   * holds can still appear; check `expiresAt` if that matters.
   */
  async get(
    resourceId: string,
    filter?: { start?: number; end?: number }
  ): Promise<Hold[]> {
    // The kernel ignores range predicates in holds SELECTs, so window with the half-open
    // overlap [start, end) client-side rather than emit SQL the parser silently drops.
    const rows = await this
      .sql`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
    const holds = rows.map(mapHold);
    const start = filter?.start;
    const end = filter?.end;
    if (start != null && end != null) {
      return holds.filter((h) => h.start < end && h.end > start);
    }
    return holds;
  }

  /** Holds for many resources in one round-trip, grouped by resource id. Every requested id is
   *  present in the result (empty array if it has none). Ids are positional ($N) params, never
   *  spliced into the SQL. */
  async getMany(resourceIds: string[]): Promise<Record<string, Hold[]>> {
    const grouped: Record<string, Hold[]> = {};
    for (const id of resourceIds) grouped[id] = [];
    if (resourceIds.length === 0) return grouped;

    const batches = await Promise.all(
      chunk(resourceIds, MAX_IN_CLAUSE_IDS).map((ids) => {
        const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ");
        return this.sql.unsafe(
          `SELECT * FROM holds WHERE resource_id IN (${placeholders})`,
          [...ids]
        );
      })
    );
    for (const rows of batches) {
      for (const row of rows) {
        const h = mapHold(row);
        (grouped[h.resourceId] ??= []).push(h);
      }
    }
    return grouped;
  }
}

function mapHold(row: Record<string, unknown>): Hold {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    expiresAt: Number(row.expires_at),
  };
}
