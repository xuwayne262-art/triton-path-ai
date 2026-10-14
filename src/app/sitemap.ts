import type { MetadataRoute } from "next";
import { courseHref, professorHref } from "@/lib/plat";
import { DEPARTMENTS } from "@/data/ucsdStructure";
import { indexForMeta, professorsForMeta, SITE_URL } from "@/lib/seo";

/**
 * Every public page: the explorer's front doors, each department, every
 * course that is current (in the catalog or on this term's schedule) and
 * every professor with a published record. Built once per deploy, from the
 * dataset that deploy ships.
 */
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [index, profs] = await Promise.all([indexForMeta(), professorsForMeta()]);
  const at = (p: string) => `${SITE_URL}${p}`;
  return [
    { url: at("/"), changeFrequency: "daily", priority: 1 },
    { url: at("/courses"), changeFrequency: "weekly", priority: 0.8 },
    { url: at("/ge"), changeFrequency: "weekly", priority: 0.8 },
    { url: at("/about"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/announcements"), changeFrequency: "weekly", priority: 0.3 },
    ...DEPARTMENTS.map((d) => ({ url: at(`/courses/${d.id}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(index?.courses ?? [])
      .filter((c) => c.o === 1 || c.ct !== 0)
      .map((c) => ({ url: at(courseHref(c.k)), changeFrequency: "weekly" as const, priority: c.o ? 0.7 : 0.4 })),
    ...(profs?.professors ?? [])
      .filter((p) => p.terms > 0 || p.cur === 1)
      .map((p) => ({ url: at(professorHref(p.n)), changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
