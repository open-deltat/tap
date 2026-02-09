import type { Sql } from "postgres";
import type { AvailabilitySlot } from "./types.js";

export class Availability {
  constructor(private readonly sql: Sql) {}

  async get(opts: {
    resourceId: string;
    start: number;
    end: number;
    minDuration?: number;
  }): Promise<AvailabilitySlot[]> {
    let rows: Record<string, unknown>[];

    if (opts.minDuration != null) {
      rows = await this
        .sql`SELECT * FROM availability WHERE resource_id = ${opts.resourceId} AND start >= ${opts.start} AND "end" <= ${opts.end} AND min_duration = ${opts.minDuration}`;
    } else {
      rows = await this
        .sql`SELECT * FROM availability WHERE resource_id = ${opts.resourceId} AND start >= ${opts.start} AND "end" <= ${opts.end}`;
    }

    return rows.map(mapSlot);
  }

  async getCombined(opts: {
    resourceIds: string[];
    start: number;
    end: number;
    minAvailable?: number;
    minDuration?: number;
  }): Promise<AvailabilitySlot[]> {
    if (opts.resourceIds.length === 0) return [];

    const inList = opts.resourceIds.map((id) => `'${id}'`).join(", ");
    const minAvail = opts.minAvailable ?? opts.resourceIds.length;

    let sql = `SELECT * FROM availability WHERE resource_id IN (${inList}) AND start >= ${opts.start} AND "end" <= ${opts.end} AND min_available = ${minAvail}`;

    if (opts.minDuration != null) {
      sql += ` AND min_duration = ${opts.minDuration}`;
    }

    const rows = await this.sql.unsafe(sql);
    return rows.map(mapSlot);
  }
}

function mapSlot(row: Record<string, unknown>): AvailabilitySlot {
  return {
    start: Number(row.start),
    end: Number(row.end),
  };
}
