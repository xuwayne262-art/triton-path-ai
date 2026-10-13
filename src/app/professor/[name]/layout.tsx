import type { Metadata } from "next";
import { professorsForMeta } from "@/lib/seo";
import { professorBySlug, typicalGrade } from "@/lib/plat";

/** Names a professor's page for link previews; the page itself is drawn in the browser. */
export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name } = await params;
  const file = await professorsForMeta();
  const prof = file ? professorBySlug(file.professors, name) : null;
  if (!prof) return { title: "Professor · UCSDPlans" };

  const letter = typicalGrade(prof.gpa, prof.terms)?.letter;
  const description = [
    letter ? `Historical average ${letter} (GPA ${prof.gpa?.toFixed(2)}) across ${prof.terms} graded terms in ${prof.c.length} courses.` : null,
    prof.cur ? "Teaching this term." : null,
  ].filter(Boolean).join(" ");
  const title = `${prof.n} · UCSDPlans`;
  return { title, description, openGraph: { title, description, siteName: "UCSDPlans", type: "profile" } };
}

export default function ProfessorLayout({ children }: { children: React.ReactNode }) {
  return children;
}
