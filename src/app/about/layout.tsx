import type { Metadata } from "next";

export const metadata: Metadata = {
  // The footer link's words, so the tab matches what was clicked.
  title: "About & data sources",
  description: "Who makes UCSDPlans, where every grade, seat and requirement comes from, and how the letter grade is worked out.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
