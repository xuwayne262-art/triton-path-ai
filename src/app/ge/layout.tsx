import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Find courses for a requirement · UCSDPlans",
  description: "Courses on each UCSD college's GE lists and on the DEI and American History & Institutions lists, with how they have graded in the past. Not a degree audit.",
};

export default function GELayout({ children }: { children: React.ReactNode }) {
  return children;
}
