import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Hold } from "./types.js";

export class Holds {
  constructor(private readonly sql: Sql) {}

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

  async release(id: string): Promise<void> {
    await this.sql`DELETE FROM holds WHERE id = ${id}`;
  }

  async get(
    resourceId: string,
    filter?: { start?: number; end?: number }
  ): Promise<Hold[]> {
    if (filter?.start != null && filter?.end != null) {
      const rows = await this.sql.unsafe(
        `SELECT * FROM holds WHERE resource_id = $1 AND start < $2 AND "end" > $3`,
        [resourceId, filter.end, filter.start]
      );
      return rows.map(mapHold);
    }
    const rows = await this
      .sql`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
    return rows.map(mapHold);
  }

  /** Holds for many resources in one round-trip, grouped by resource id. Every requested id is
   *  present in the result (empty array if it has none). Ids are positional ($N) params, never
   *  spliced into the SQL. */
  async getMany(resourceIds: string[]): Promise<Record<string, Hold[]>> {
    const grouped: Record<string, Hold[]> = {};
    for (const id of resourceIds) grouped[id] = [];
    if (resourceIds.length === 0) return grouped;

    const placeholders = resourceIds.map((_, i) => `$${i + 1}`).join(", ");
    const rows = await this.sql.unsafe(
      `SELECT * FROM holds WHERE resource_id IN (${placeholders})`,
      [...resourceIds]
    );
    for (const row of rows) {
      const h = mapHold(row);
      (grouped[h.resourceId] ??= []).push(h);
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
