/** Kernel bounds an `IN` list at MAX_IN_CLAUSE_IDS (1000 release, 200 test); 200 stays under both. */
export const MAX_IN_CLAUSE_IDS = 200;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}
