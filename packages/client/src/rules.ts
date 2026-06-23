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

    if (rules.length === 1) {
      const r = rules[0];
      await this
        .sql`INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES (${r.id}, ${r.resourceId}, ${r.start}, ${r.end}, ${r.blocking})`;
    } else {
      // One multi-row INSERT — deltat now honors multi-row rule inserts (BatchInsertRules), so a
      // 90-day schedule projection is a single round-trip instead of one INSERT per rule.
      const params: (string | number | boolean)[] = [];
      const valueRows: string[] = [];
      for (const r of rules) {
        const i = params.length;
        params.push(r.id, r.resourceId, r.start, r.end, r.blocking);
        valueRows.push(`($${i + 1}, $${i + 2}, $${i + 3}, $${i + 4}, $${i + 5})`);
      }
      await this.sql.unsafe(
        `INSERT INTO rules (id, resource_id, start, "end", blocking) VALUES ${valueRows.join(", ")}`,
        params
      );
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
