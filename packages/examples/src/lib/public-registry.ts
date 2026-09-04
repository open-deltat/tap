import { openBookableRegistry } from "./public-bookables";

// The one process-wide registry instance. It lives here rather than in `public-bookables.ts` so
// that module stays pure and its tests never touch the deployed registry file.
//
// Single-instance by construction: two app replicas would each hold their own copy of this map and
// clobber each other's writes on flush. Moving off one container means moving this to a real store
// first, and that is a deliberate constraint, not an oversight.
export const publicRegistry = openBookableRegistry(
  process.env.PUBLIC_BOOKABLES_PATH ?? "./data/public-bookables.json"
);
