import { readFileSync } from "node:fs";
import { join } from "node:path";

// Docs prose lives as markdown next to the routes and is read at build time (every /docs page is
// statically generated), so content stays plain markdown instead of backtick-escaped string literals.
const DIR = join(process.cwd(), "app", "docs", "_content");

export function docContent(name: string): string {
  return readFileSync(join(DIR, `${name}.md`), "utf8");
}
