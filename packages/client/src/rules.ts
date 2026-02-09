import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Rule } from "./types.js";

export class Rules {
  constructor(private readonly sql: Sql) {}

  async add(opts: {
    resourceId: string;
    start: number;
    end: number;
    blocking?: boolean;
  }): Promise<Rule> {
    const id = ulid();
    const blocking = opts.blocking ?? false;

    await this
      .sql`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${id}, ${opts.resourceId}, ${opts.start}, ${opts.end}, ${blocking})`;

    return {
      id,
      resourceId: opts.resourceId,
      start: opts.start,
      end: opts.end,
      blocking,
    };
  }

  async update(
    id: string,
    opts: { start: number; end: number; blocking: boolean }
  ): Promise<void> {
    await this.sql.unsafe(
      `UPDATE rules SET start = $1, "end" = $2, blocking = $3 WHERE id = $4`,
      [opts.start, opts.end, opts.blocking, id]
    );
  }

  async delete(id: string): Promise<void> {
    await this.sql`DELETE FROM rules WHERE id = ${id}`;
  }

  async get(resourceId: string): Promise<Rule[]> {
    const rows = await this
      .sql`SELECT * FROM rules WHERE resource_id = ${resourceId}`;
    return rows.map(mapRule);
  }
}

function mapRule(row: Record<string, unknown>): Rule {
  return {
    id: String(row.id),
    resourceId: String(row.resource_id),
    start: Number(row.start),
    end: Number(row.end),
    blocking: row.blocking === true || row.blocking === "t",
  };
}
