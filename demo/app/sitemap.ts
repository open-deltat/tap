import type { MetadataRoute } from "next";
import { enabledExampleIds } from "@open-deltat/examples/config";
import { DOCS_PATHS } from "@/lib/docs-nav";
import { SITE } from "@/lib/seo";

// Indexable surface only: the landing, /new, every docs page (derived from the docs nav tree, so
// the two can never drift), and every enabled demo. /embed, /embed-test, and /calendar are left out
// on purpose (chrome-free duplicates, a test host page, and machine feeds; robots.ts disallows them).
// /b/ is excluded too, but for a different reason: those pages are stranger-supplied text.
export default function sitemap(): MetadataRoute.Sitemap {
  const demoPaths = enabledExampleIds().map((id) => `/demos/${id}`);
  const entries: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    { path: "/new", priority: 0.9 },
    ...DOCS_PATHS.map((path) => ({ path, priority: 0.8 })),
    ...demoPaths.map((path) => ({ path, priority: 0.6 })),
  ];
  return entries.map(({ path, priority }) => ({
    url: path === "/" ? SITE.url : `${SITE.url}${path}`,
    changeFrequency: "weekly",
    priority,
  }));
}
