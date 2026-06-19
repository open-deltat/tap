import type { Sql } from "postgres";
import { ulid } from "ulid";
import type { Rule } from "./types.js";

export class Rules {
  constructor(private readonly sql: Sql) {}

  async create(
    items: {
      resourceId: string;
      start: number;
      end: number;
      blocking?: boolean;
    }[]
  ): Promise<Rule[]> {
    if (items.length === 0) return [];

    const rules: Rule[] = items.map((item) => ({
      id: ulid(),
      resourceId: item.resourceId,
      start: item.start,
      end: item.end,
      blocking: item.blocking ?? false,
    }));

    // deltat honors only single-row rule inserts — a multi-row VALUES(...) silently keeps
    // just the first row. Rules are independent (no all-or-nothing semantics), so insert
    // them one at a time. (Becomes a native batch op when the framed protocol replaces SQL.)
    for (const r of rules) {
      await this
        .sql`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${r.id}, ${r.resourceId}, ${r.start}, ${r.end}, ${r.blocking})`;
    }

    return rules;
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
