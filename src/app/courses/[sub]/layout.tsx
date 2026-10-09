import type { Metadata } from "next";
import { collegeById, collegeForSubject, departmentById, departmentForSubject } from "@/data/ucsdStructure";

/** Names a department's page for link previews and the browser tab. */
export async function generateMetadata({ params }: { params: Promise<{ sub: string }> }): Promise<Metadata> {
  const param = decodeURIComponent((await params).sub);
  const unit = departmentById(param) ?? departmentForSubject(param.toUpperCase())
    ?? collegeById(param) ?? collegeForSubject(param.toUpperCase());
  const name = unit?.name ?? param.toUpperCase();
  return {
    title: `${name} courses · UCSDPlans`,
    description: `Every ${name} course at UC San Diego with its grade history, this term's professors and sections.`,
  };
}

export default function DepartmentLayout({ children }: { children: React.ReactNode }) {
  return children;
}
