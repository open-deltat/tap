// Single source of truth for which example demos a deployment exposes.
//
// A full demo site exposes the whole catalog; a single-purpose deployment (e.g. a cinema
// product) sets DEMO_EXAMPLES to a comma list so ONLY those examples appear in the nav, get
// seeded, and are routable. Everything else (nav, seeding, route guards) derives from here.
//
//   DEMO_EXAMPLES=cinema            → cinema only
//   DEMO_EXAMPLES=hotel,restaurant  → two examples
//   (unset) or DEMO_EXAMPLES=all    → everything

export const ALL_EXAMPLE_IDS = [
  "airline",
  "theater",
  "cinema",
  "stadium",
  "hotel",
  "restaurant",
  "parking",
  "availability",
  "meet",
  "live",
  "builder",
] as const;

export type ExampleId = (typeof ALL_EXAMPLE_IDS)[number];

// NEXT_PUBLIC_ so the client (nav) and the server (seeding, route guards) read the same value.
function enabledSet(): Set<string> | null {
  const raw = (process.env.NEXT_PUBLIC_DEMO_EXAMPLES ?? process.env.DEMO_EXAMPLES ?? "").trim();
  if (!raw || raw.toLowerCase() === "all") return null; // null → all enabled
  return new Set(raw.split(",").map((s) => s.trim()).filter(Boolean));
}

export function isExampleEnabled(id: string): boolean {
  const s = enabledSet();
  return s ? s.has(id) : true;
}

export function enabledExampleIds(): ExampleId[] {
  const s = enabledSet();
  return ALL_EXAMPLE_IDS.filter((id) => (s ? s.has(id) : true));
}
