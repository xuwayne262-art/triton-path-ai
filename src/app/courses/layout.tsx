import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/siteTitle";

export const metadata: Metadata = {
  // Passes the template on: a plain string here would drop " | UCSDPlans"
  // from every department page below it.
  title: { default: "Courses by department", template: TITLE_TEMPLATE },
  description: "Every UCSD department and college, with each course's grade history, this term's professors and sections.",
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
