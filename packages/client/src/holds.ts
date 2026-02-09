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

  async get(resourceId: string): Promise<Hold[]> {
    const rows = await this
      .sql`SELECT * FROM holds WHERE resource_id = ${resourceId}`;
    return rows.map(mapHold);
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
