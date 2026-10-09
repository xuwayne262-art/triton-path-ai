import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Courses by department · UCSDPlans",
  description: "Every UCSD department and college, with each course's grade history, this term's professors and sections.",
};

export default function CoursesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
