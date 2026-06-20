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

    // Parameterized like every other SDK builder — never string-splice ids/values into SQL.
    const minAvail = opts.minAvailable ?? opts.resourceIds.length;
    const values: (string | number)[] = [...opts.resourceIds];
    const idPlaceholders = opts.resourceIds.map((_, i) => `$${i + 1}`).join(", ");
    const startParam = values.push(opts.start);
    const endParam = values.push(opts.end);
    const minAvailParam = values.push(minAvail);

    let sql = `SELECT * FROM availability WHERE resource_id IN (${idPlaceholders}) AND start >= $${startParam} AND "end" <= $${endParam} AND min_available = $${minAvailParam}`;

    if (opts.minDuration != null) {
      const minDurationParam = values.push(opts.minDuration);
      sql += ` AND min_duration = $${minDurationParam}`;
    }

    const rows = await this.sql.unsafe(sql, values);
    return rows.map(mapSlot);
  }
}

function mapSlot(row: Record<string, unknown>): AvailabilitySlot {
  return {
    start: Number(row.start),
    end: Number(row.end),
  };
}
