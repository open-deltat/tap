import type { MetadataRoute } from "next";
import { enabledExampleIds } from "@open-deltat/examples/config";
import { SITE } from "@/lib/seo";

// Indexable surface only: the landing, the docs, and every enabled demo. /embed and /calendar are
// left out on purpose (they are chrome-free or machine feeds, and robots.ts disallows them).
const DOC_PATHS = [
  "/docs",
  "/docs/data-model",
  "/docs/holds-and-availability",
  "/docs/protocol-and-engine",
  "/docs/sdk",
  "/docs/sdk/quickstart",
  "/docs/sdk/reference",
  "/docs/sdk/self-host",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const demoPaths = enabledExampleIds().map((id) => `/demos/${id}`);
  const entries: { path: string; priority: number }[] = [
    { path: "/", priority: 1 },
    ...DOC_PATHS.map((path) => ({ path, priority: 0.8 })),
    ...demoPaths.map((path) => ({ path, priority: 0.6 })),
  ];
  return entries.map(({ path, priority }) => ({
    url: path === "/" ? SITE.url : `${SITE.url}${path}`,
    changeFrequency: "weekly",
    priority,
  }));
}
