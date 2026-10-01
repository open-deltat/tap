import { openBookableRegistry, type BookableRegistry } from "./public-bookables";

// The one process-wide registry instance. It lives here rather than in `public-bookables.ts` so
// that module stays pure and its tests never touch the deployed registry file.
//
// One per PROCESS, not per module graph. The demo's custom server (server.ts, run by Bun) and the
// Next app it hosts (bundled separately) each evaluate this module, so a plain module-level instance
// existed twice: each loaded the file once at boot and only the Next copy saw later writes. A
// calendar created or switched to "Approve each meeting" after a deploy was then unknown, or still
// instant, to the /ws bridge: the dashboard's live view looped on "Unknown bookable", and a direct
// hold could bypass the owner's approval. Both graphs share one realm, so the instance lives there.
//
// Single-instance by construction: two app replicas would each hold their own copy of this map and
// clobber each other's writes on flush. Moving off one container means moving this to a real store
// first, and that is a deliberate constraint, not an oversight.
const shared = globalThis as typeof globalThis & { __deltatPublicRegistry?: BookableRegistry };

export const publicRegistry: BookableRegistry = (shared.__deltatPublicRegistry ??= openBookableRegistry(
  process.env.PUBLIC_BOOKABLES_PATH ?? "./data/public-bookables.json"
));
