import type { Metadata } from "next";
import { courseForMeta } from "@/lib/seo";
import { tidyTitle, typicalGrade } from "@/lib/plat";

/**
 * The course page is drawn in the browser; this names it on the server, so a
 * shared link previews as the course instead of the site's name.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ sub: string; num: string }>;
}): Promise<Metadata> {
  const raw = await params;
  const sub = decodeURIComponent(raw.sub).toUpperCase();
  const code = `${sub} ${decodeURIComponent(raw.num)}`;
  const { detail, termName } = await courseForMeta(sub, code);
  if (!detail) return { title: `${code} · UCSDPlans` };

  const letter = typicalGrade(detail.gpa, detail.terms)?.letter;
  const teaching = detail.profs.filter((p) => p.cur === 1).map((p) => p.i);
  const description = [
    letter && detail.gpa != null ? `Historical average ${letter} (GPA ${detail.gpa.toFixed(2)}) in ${code} across ${detail.terms} graded terms.` : null,
    teaching.length && termName ? `${termName}: ${teaching.slice(0, 2).join(" and ")}${teaching.length > 2 ? " and others" : ""}.` : null,
    detail.desc ? detail.desc.slice(0, 180) + (detail.desc.length > 180 ? "…" : "") : null,
  ].filter(Boolean).join(" ");

  const title = `${code} ${tidyTitle(detail.t)} · UCSDPlans`;
  return {
    title,
    description,
    openGraph: { title, description, siteName: "UCSDPlans", type: "website" },
  };
}

export default function CourseLayout({ children }: { children: React.ReactNode }) {
  return children;
}
