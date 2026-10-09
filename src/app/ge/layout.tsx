import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Easy GEs · UCSDPlans",
  description: "Every UCSD college's approved GE courses, plus DEI and American History & Institutions, ranked by the grades students actually got.",
};

export default function GELayout({ children }: { children: React.ReactNode }) {
  return children;
}
