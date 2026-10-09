import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";

/**
 * The course explorer is public and worth finding; a student's own pages are
 * behind sign-in and would only answer a crawler with the login screen. The
 * pages draw themselves from /data/plat and /api/seats, so a crawler that
 * renders them must be let read those too.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/data/plat/", "/api/seats"],
      disallow: ["/planner", "/import", "/housing", "/login", "/api/"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
