import type { MetadataRoute } from "next";
import { courseHref, professorHref } from "@/lib/plat";
import { DEPARTMENTS } from "@/data/ucsdStructure";
import { indexForMeta, laterTermCourses, professorsForMeta, SITE_URL } from "@/lib/seo";

/**
 * Every public page: the explorer's front doors, each department, every
 * course that is current (in the catalog or on this term's schedule) and
 * every professor with a published record. Built once per deploy, from the
 * dataset that deploy ships.
 */
export const dynamic = "force-static";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [index, profs, later] = await Promise.all([indexForMeta(), professorsForMeta(), laterTermCourses()]);
  // Every course on a later quarter's schedule is current too, even one the catalog and Fall do not have.
  const known = new Set((index?.courses ?? []).map((c) => c.k));
  const at = (p: string) => `${SITE_URL}${p}`;
  return [
    { url: at("/"), changeFrequency: "daily", priority: 1 },
    { url: at("/courses"), changeFrequency: "weekly", priority: 0.8 },
    { url: at("/ge"), changeFrequency: "weekly", priority: 0.8 },
    { url: at("/about"), changeFrequency: "monthly", priority: 0.3 },
    { url: at("/announcements"), changeFrequency: "weekly", priority: 0.3 },
    ...DEPARTMENTS.map((d) => ({ url: at(`/courses/${d.id}`), changeFrequency: "weekly" as const, priority: 0.6 })),
    ...(index?.courses ?? [])
      .filter((c) => c.o === 1 || c.ct !== 0 || later.has(c.k))
      .map((c) => ({ url: at(courseHref(c.k)), changeFrequency: "weekly" as const, priority: c.o ? 0.7 : 0.4 })),
    ...[...later.keys()]
      .filter((k) => !known.has(k))
      .map((k) => ({ url: at(courseHref(k)), changeFrequency: "weekly" as const, priority: 0.7 })),
    ...(profs?.professors ?? [])
      .filter((p) => p.terms > 0 || p.cur === 1)
      .map((p) => ({ url: at(professorHref(p.n)), changeFrequency: "monthly" as const, priority: 0.4 })),
  ];
}
