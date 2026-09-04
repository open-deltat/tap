import type { MetadataRoute } from "next";
import { SITE } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // /b/ is every bookable a stranger published. Their titles are user text on our domain, so
        // they stay out of the index and out of the sitemap; the pages carry noindex too.
        disallow: ["/embed/", "/embed-test", "/calendar/", "/b/"],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
