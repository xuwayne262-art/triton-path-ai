import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About UCSDPlans · where the numbers come from",
  description: "Who makes UCSDPlans, where every grade, seat and requirement comes from, and how the letter grade is worked out.",
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
