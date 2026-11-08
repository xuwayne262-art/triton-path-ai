import type { Metadata } from "next";
import { TITLE_TEMPLATE } from "@/lib/siteTitle";
import PlannerShell from "./PlannerShell";

/**
 * A server layout only so the Planner can name its browser tab: its chrome
 * and pages are client components, which cannot export metadata. This term
 * is "Planner | UCSDPlans"; the other views name themselves, and the
 * template is passed on so they keep " | UCSDPlans".
 */
export const metadata: Metadata = {
  title: { default: "Planner", template: TITLE_TEMPLATE },
};

export default function PlannerLayout({ children }: { children: React.ReactNode }) {
  return <PlannerShell>{children}</PlannerShell>;
}
