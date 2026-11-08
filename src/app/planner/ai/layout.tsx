import type { Metadata } from "next";

/** Only here to name the tab; the page is a client component. */
export const metadata: Metadata = { title: "Plan with AI" };

export default function PlanWithAILayout({ children }: { children: React.ReactNode }) {
  return children;
}
