export type SqlValue = string | number | null;

/**
 * The `VALUES` list of a multi-row INSERT with every value a positional parameter, so nothing a
 * caller supplies is spliced into the SQL text. Every row has the same columns, so row `r`'s
 * values are numbered from `r * width + 1`.
 */
export function valuesOf(rows: readonly (readonly SqlValue[])[]): { list: string; params: SqlValue[] } {
  const list = rows
    .map((row, r) => `(${row.map((_, c) => `$${r * row.length + c + 1}`).join(", ")})`)
    .join(", ");
  return { list, params: rows.flat() };
}
