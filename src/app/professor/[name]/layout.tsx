import type { Metadata } from "next";
import { professorsForMeta } from "@/lib/seo";
import { professorSlug, typicalGrade } from "@/lib/plat";

/** Names a professor's page for link previews; the page itself is drawn in the browser. */
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const file = await professorsForMeta();
  const prof = file?.professors.find((p) => professorSlug(p.n) === name);
  if (!prof) return { title: "Professor · UCSDPlans" };

  const letter = typicalGrade(prof.gpa, prof.terms)?.letter;
  const description = [
    letter ? `Students typically earn a ${letter} in ${prof.n}'s classes, across ${prof.terms} graded terms and ${prof.c.length} courses.` : null,
    prof.cur ? "Teaching this term." : null,
  ].filter(Boolean).join(" ");
  const title = `${prof.n} · UCSDPlans`;
  return { title, description, openGraph: { title, description, siteName: "UCSDPlans", type: "profile" } };
}

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
